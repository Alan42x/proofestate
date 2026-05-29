// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

contract PropertyVerification is AccessControl {
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");
    bytes32 public constant COMPLIANCE_ROLE = keccak256("COMPLIANCE_ROLE");

    struct VerificationRecord {
        bool verified;
        bool compliant;
        bytes32 evidenceHash;
        bytes32 complianceHash;
        uint256 valuationCommitment;
        uint256 principalCommitment;
        uint64 lastUpdated;
    }

    mapping(bytes32 propertyId => VerificationRecord) private records;

    event PropertyVerificationUpdated(
        bytes32 indexed propertyId,
        bool verified,
        bytes32 evidenceHash,
        uint256 valuationCommitment,
        uint64 lastUpdated
    );
    event PropertyComplianceUpdated(
        bytes32 indexed propertyId,
        bool compliant,
        bytes32 proofHash,
        uint256 principalCommitment,
        uint64 lastUpdated
    );

    error EmptyPropertyId();
    error PropertyNotVerified(bytes32 propertyId);
    error InvalidPrincipalCommitment();

    constructor(address admin) {
        address roleAdmin = admin == address(0) ? msg.sender : admin;
        _grantRole(DEFAULT_ADMIN_ROLE, roleAdmin);
        _grantRole(ORACLE_ROLE, roleAdmin);
    }

    function setVerified(
        bytes32 propertyId,
        bool verified,
        bytes32 evidenceHash,
        uint256 valuationCommitment
    )
        external
        onlyRole(ORACLE_ROLE)
    {
        if (propertyId == bytes32(0)) revert EmptyPropertyId();

        VerificationRecord storage record = records[propertyId];
        record.verified = verified;
        record.compliant = false;
        record.evidenceHash = evidenceHash;
        record.complianceHash = bytes32(0);
        record.valuationCommitment = verified ? valuationCommitment : 0;
        record.principalCommitment = 0;
        record.lastUpdated = uint64(block.timestamp);

        emit PropertyVerificationUpdated(
            propertyId,
            verified,
            evidenceHash,
            record.valuationCommitment,
            record.lastUpdated
        );
    }

    function setCompliant(
        bytes32 propertyId,
        bool compliant,
        bytes32 proofHash,
        uint256 principalCommitment
    )
        external
        onlyRole(COMPLIANCE_ROLE)
    {
        if (propertyId == bytes32(0)) revert EmptyPropertyId();
        if (!records[propertyId].verified) revert PropertyNotVerified(propertyId);
        if (compliant && principalCommitment == 0) revert InvalidPrincipalCommitment();

        VerificationRecord storage record = records[propertyId];
        record.compliant = compliant;
        record.complianceHash = compliant ? proofHash : bytes32(0);
        record.principalCommitment = compliant ? principalCommitment : 0;
        record.lastUpdated = uint64(block.timestamp);

        emit PropertyComplianceUpdated(
            propertyId,
            compliant,
            proofHash,
            record.principalCommitment,
            record.lastUpdated
        );
    }

    function isVerified(bytes32 propertyId) external view returns (bool) {
        return records[propertyId].verified;
    }

    function isCompliant(bytes32 propertyId) external view returns (bool) {
        VerificationRecord memory record = records[propertyId];
        return record.verified && record.compliant;
    }

    function isCompliantFor(bytes32 propertyId, uint256 principalCommitment)
        external
        view
        returns (bool)
    {
        VerificationRecord memory record = records[propertyId];
        return record.verified && record.compliant && record.principalCommitment == principalCommitment;
    }

    function valuationCommitmentOf(bytes32 propertyId) external view returns (uint256) {
        return records[propertyId].valuationCommitment;
    }

    function getRecord(bytes32 propertyId)
        external
        view
        returns (VerificationRecord memory)
    {
        return records[propertyId];
    }
}
