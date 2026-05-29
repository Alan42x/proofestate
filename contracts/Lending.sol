// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

interface IPropertyVerificationReader {
    function isVerified(bytes32 propertyId) external view returns (bool);
    function isCompliant(bytes32 propertyId) external view returns (bool);
    function isCompliantFor(bytes32 propertyId, uint256 principalCommitment) external view returns (bool);
}

contract Lending is AccessControl {
    bytes32 public constant LOAN_OFFICER_ROLE = keccak256("LOAN_OFFICER_ROLE");

    uint256 public constant DEFAULT_INTEREST_RATE_BPS = 650;
    uint256 public constant DEFAULT_TERM_DAYS = 365;

    enum LoanState {
        Requested,
        Approved,
        Repaid,
        Rejected,
        Cancelled
    }

    struct Loan {
        address borrower;
        bytes32 propertyId;
        uint256 principalCommitment;
        uint256 interestRateBps;
        uint256 termDays;
        LoanState state;
        uint256 requestedAt;
        uint256 approvedAt;
        uint256 repaidAt;
    }

    IPropertyVerificationReader public immutable propertyVerification;
    uint256 public nextLoanId;
    mapping(uint256 loanId => Loan) private loans;
    mapping(bytes32 propertyId => uint256 activeLoanIdPlusOne) private activeLoanByProperty;
    mapping(bytes32 propertyId => uint256[] loanIds) private loanIdsByProperty;

    event LoanRequested(
        uint256 indexed loanId,
        address indexed borrower,
        bytes32 indexed propertyId,
        uint256 principalCommitment
    );
    event LoanApproved(uint256 indexed loanId, bytes32 indexed propertyId);
    event LoanRejected(uint256 indexed loanId, bytes32 indexed propertyId);
    event LoanRejectedDueToVerification(uint256 indexed loanId, bytes32 indexed propertyId);
    event LoanRejectedDueToCompliance(uint256 indexed loanId, bytes32 indexed propertyId);
    event LoanRejectedDueToProofMismatch(
        uint256 indexed loanId,
        bytes32 indexed propertyId,
        uint256 principalCommitment
    );
    event LoanRepaid(uint256 indexed loanId, address indexed borrower);
    event LoanCancelled(uint256 indexed loanId, bytes32 indexed propertyId, address indexed borrower);

    error EmptyPropertyId();
    error InvalidPrincipalCommitment();
    error InvalidLoanId(uint256 loanId);
    error InvalidLoanState(uint256 loanId, LoanState expected, LoanState actual);
    error NotBorrower(uint256 loanId, address caller);
    error InvalidVerificationAddress();
    error ActiveLoanExists(bytes32 propertyId, uint256 loanId);

    constructor(address verificationAddress, address admin) {
        if (verificationAddress == address(0)) revert InvalidVerificationAddress();
        propertyVerification = IPropertyVerificationReader(verificationAddress);

        address roleAdmin = admin == address(0) ? msg.sender : admin;
        _grantRole(DEFAULT_ADMIN_ROLE, roleAdmin);
        _grantRole(LOAN_OFFICER_ROLE, roleAdmin);
    }

    function requestLoan(bytes32 propertyId, uint256 principalCommitment)
        external
        returns (uint256 loanId)
    {
        if (propertyId == bytes32(0)) revert EmptyPropertyId();
        if (principalCommitment == 0) revert InvalidPrincipalCommitment();
        uint256 activeLoan = activeLoanByProperty[propertyId];
        if (activeLoan != 0) revert ActiveLoanExists(propertyId, activeLoan - 1);

        loanId = nextLoanId++;
        loans[loanId] = Loan({
            borrower: msg.sender,
            propertyId: propertyId,
            principalCommitment: principalCommitment,
            interestRateBps: DEFAULT_INTEREST_RATE_BPS,
            termDays: DEFAULT_TERM_DAYS,
            state: LoanState.Requested,
            requestedAt: block.timestamp,
            approvedAt: 0,
            repaidAt: 0
        });
        activeLoanByProperty[propertyId] = loanId + 1;
        loanIdsByProperty[propertyId].push(loanId);

        emit LoanRequested(loanId, msg.sender, propertyId, principalCommitment);
    }

    function approveLoan(uint256 loanId)
        external
        onlyRole(LOAN_OFFICER_ROLE)
        returns (bool approved)
    {
        Loan storage loan = _loanOrRevert(loanId);
        if (loan.state != LoanState.Requested) {
            revert InvalidLoanState(loanId, LoanState.Requested, loan.state);
        }

        if (!propertyVerification.isVerified(loan.propertyId)) {
            loan.state = LoanState.Rejected;
            _releaseActiveLoan(loan.propertyId, loanId);
            emit LoanRejectedDueToVerification(loanId, loan.propertyId);
            return false;
        }

        if (!propertyVerification.isCompliantFor(loan.propertyId, loan.principalCommitment)) {
            loan.state = LoanState.Rejected;
            _releaseActiveLoan(loan.propertyId, loanId);
            if (propertyVerification.isCompliant(loan.propertyId)) {
                emit LoanRejectedDueToProofMismatch(
                    loanId,
                    loan.propertyId,
                    loan.principalCommitment
                );
            } else {
                emit LoanRejectedDueToCompliance(loanId, loan.propertyId);
            }
            return false;
        }

        loan.state = LoanState.Approved;
        loan.approvedAt = block.timestamp;

        emit LoanApproved(loanId, loan.propertyId);
        return true;
    }

    function rejectLoan(uint256 loanId) external onlyRole(LOAN_OFFICER_ROLE) {
        Loan storage loan = _loanOrRevert(loanId);
        if (loan.state != LoanState.Requested) {
            revert InvalidLoanState(loanId, LoanState.Requested, loan.state);
        }

        loan.state = LoanState.Rejected;
        _releaseActiveLoan(loan.propertyId, loanId);

        emit LoanRejected(loanId, loan.propertyId);
    }

    function repay(uint256 loanId) external {
        Loan storage loan = _loanOrRevert(loanId);
        if (loan.state != LoanState.Approved) {
            revert InvalidLoanState(loanId, LoanState.Approved, loan.state);
        }
        if (loan.borrower != msg.sender) revert NotBorrower(loanId, msg.sender);

        loan.state = LoanState.Repaid;
        loan.repaidAt = block.timestamp;
        _releaseActiveLoan(loan.propertyId, loanId);

        emit LoanRepaid(loanId, msg.sender);
    }

    function cancelLoan(uint256 loanId) external {
        Loan storage loan = _loanOrRevert(loanId);
        if (loan.state != LoanState.Requested) {
            revert InvalidLoanState(loanId, LoanState.Requested, loan.state);
        }
        if (loan.borrower != msg.sender) revert NotBorrower(loanId, msg.sender);

        loan.state = LoanState.Cancelled;
        _releaseActiveLoan(loan.propertyId, loanId);

        emit LoanCancelled(loanId, loan.propertyId, msg.sender);
    }

    function getLoan(uint256 loanId) external view returns (Loan memory) {
        return _loanOrRevert(loanId);
    }

    function activeLoanIdOf(bytes32 propertyId) external view returns (uint256 loanId, bool exists) {
        uint256 activeLoan = activeLoanByProperty[propertyId];
        if (activeLoan == 0) return (0, false);
        return (activeLoan - 1, true);
    }

    function loanIdsOfProperty(bytes32 propertyId) external view returns (uint256[] memory) {
        return loanIdsByProperty[propertyId];
    }

    function _loanOrRevert(uint256 loanId) private view returns (Loan storage loan) {
        if (loanId >= nextLoanId) revert InvalidLoanId(loanId);
        return loans[loanId];
    }

    function _releaseActiveLoan(bytes32 propertyId, uint256 loanId) private {
        if (activeLoanByProperty[propertyId] == loanId + 1) {
            activeLoanByProperty[propertyId] = 0;
        }
    }
}
