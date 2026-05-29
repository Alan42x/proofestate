// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IPropertyVerificationWriter {
    function setCompliant(
        bytes32 propertyId,
        bool compliant,
        bytes32 proofHash,
        uint256 principalCommitment
    ) external;
    function isVerified(bytes32 propertyId) external view returns (bool);
    function valuationCommitmentOf(bytes32 propertyId) external view returns (uint256);
}

interface ILtvGroth16Verifier {
    function verifyProof(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[4] calldata publicSignals
    ) external view returns (bool);
}

contract ComplianceVerifier {
    uint256 public constant SNARK_SCALAR_FIELD =
        21888242871839275222246405745257275088548364400416034343698204186575808495617;
    uint256 public constant MAX_LTV_BPS = 8000;

    IPropertyVerificationWriter public immutable propertyVerification;
    ILtvGroth16Verifier public immutable ltvVerifier;

    event ComplianceProofVerified(
        bytes32 indexed propertyId,
        bytes32 proofHash,
        uint256 valuationCommitment,
        uint256 principalCommitment
    );

    error PropertyNotVerified(bytes32 propertyId);
    error InvalidPropertyVerificationAddress();
    error InvalidGroth16VerifierAddress();
    error InvalidPublicSignal(uint256 index, uint256 expected, uint256 actual);
    error InvalidProof();

    constructor(address propertyVerificationAddress, address ltvVerifierAddress) {
        if (propertyVerificationAddress == address(0)) {
            revert InvalidPropertyVerificationAddress();
        }
        if (ltvVerifierAddress == address(0)) {
            revert InvalidGroth16VerifierAddress();
        }
        propertyVerification = IPropertyVerificationWriter(propertyVerificationAddress);
        ltvVerifier = ILtvGroth16Verifier(ltvVerifierAddress);
    }

    function propertyIdToField(bytes32 propertyId) public pure returns (uint256) {
        return uint256(propertyId) % SNARK_SCALAR_FIELD;
    }

    function verifyProofAndSetCompliance(
        bytes32 propertyId,
        uint256 principalCommitment,
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[4] calldata publicSignals
    ) external returns (bool) {
        if (!propertyVerification.isVerified(propertyId)) {
            revert PropertyNotVerified(propertyId);
        }

        uint256 expectedPropertySignal = propertyIdToField(propertyId);
        uint256 valuationCommitment = propertyVerification.valuationCommitmentOf(propertyId);

        _requireSignal(0, expectedPropertySignal, publicSignals[0]);
        _requireSignal(1, valuationCommitment, publicSignals[1]);
        _requireSignal(2, principalCommitment, publicSignals[2]);
        _requireSignal(3, MAX_LTV_BPS, publicSignals[3]);

        if (!ltvVerifier.verifyProof(a, b, c, publicSignals)) {
            revert InvalidProof();
        }

        bytes32 proofHash = keccak256(abi.encode(a, b, c, publicSignals));
        propertyVerification.setCompliant(propertyId, true, proofHash, principalCommitment);

        emit ComplianceProofVerified(
            propertyId,
            proofHash,
            valuationCommitment,
            principalCommitment
        );
        return true;
    }

    function _requireSignal(uint256 index, uint256 expected, uint256 actual) private pure {
        if (expected != actual) {
            revert InvalidPublicSignal(index, expected, actual);
        }
    }
}
