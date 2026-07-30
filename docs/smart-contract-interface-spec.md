# Smart Contract Interface Spec

## PropertyVerification

Purpose: stores Oracle-written property verification records and verifier-written compliance records.

Roles:

- `DEFAULT_ADMIN_ROLE`: manages roles.
- `ORACLE_ROLE`: may call `setVerified`.
- `COMPLIANCE_ROLE`: may call `setCompliant`; granted to `ComplianceVerifier`.

Constructor:

```text
constructor(address admin)
```

If `admin` is zero, `msg.sender` becomes admin and initial oracle.

Public/external methods:

| Method | Access | Returns | State changes |
| --- | --- | --- | --- |
| `setVerified(bytes32 propertyId, bool verified, bytes32 evidenceHash, uint256 valuationCommitment, address owner)` | `ORACLE_ROLE` | none | Writes verification record, clears stale compliance, clears principal commitment |
| `setCompliant(bytes32 propertyId, bool compliant, bytes32 proofHash, uint256 principalCommitment)` | `COMPLIANCE_ROLE` | none | Writes compliance status, proof hash, and principal commitment |
| `isVerified(bytes32 propertyId)` | public view | `bool` | none |
| `isCompliant(bytes32 propertyId)` | public view | `bool` | none |
| `isCompliantFor(bytes32 propertyId, uint256 principalCommitment)` | public view | `bool` | none |
| `valuationCommitmentOf(bytes32 propertyId)` | public view | `uint256` | none |
| `ownerOf(bytes32 propertyId)` | public view | `address` | none |
| `getRecord(bytes32 propertyId)` | public view | `VerificationRecord` | none |

Events:

- `PropertyVerificationUpdated(propertyId, verified, owner, evidenceHash, valuationCommitment, lastUpdated)`.
- `PropertyComplianceUpdated(propertyId, compliant, proofHash, principalCommitment, lastUpdated)`.

Custom errors and revert conditions:

- `EmptyPropertyId()` when `propertyId == bytes32(0)`.
- `InvalidOwnerAddress()` when a positive verification or non-zero evidence hash uses `address(0)`.
- `PropertyNotVerified(propertyId)` when compliance is written for an unverified property.
- `InvalidPrincipalCommitment()` when compliant state is true but principal commitment is zero.
- OpenZeppelin `AccessControlUnauthorizedAccount` when caller lacks a required role.

Demo limitations:

- Verification data comes from a mock JSON registry.
- Compliance is a single stored status per property and principal commitment.

Production considerations:

- Add freshness policy, registry attestation provenance, and operational oracle governance.

## ComplianceVerifier

Purpose: validates Groth16 public signals and proof calldata, then writes compliance to `PropertyVerification`.

Constructor:

```text
constructor(address propertyVerificationAddress, address ltvVerifierAddress)
```

Reverts:

- `InvalidPropertyVerificationAddress()` for zero property verification address.
- `InvalidGroth16VerifierAddress()` for zero Groth16 verifier address.

Public/external methods:

| Method | Access | Returns | State changes |
| --- | --- | --- | --- |
| `propertyIdToField(bytes32 propertyId)` | public pure | `uint256` | none |
| `verifyProofAndSetCompliance(bytes32 propertyId, uint256 principalCommitment, uint256[2] a, uint256[2][2] b, uint256[2] c, uint256[4] publicSignals)` | public | `bool` | Calls `PropertyVerification.setCompliant` |

Public signal expectations:

- `publicSignals[0] == propertyIdToField(propertyId)`.
- `publicSignals[1] == PropertyVerification.valuationCommitmentOf(propertyId)`.
- `publicSignals[2] == principalCommitment`.
- `publicSignals[3] == 8000`.

Events:

- `ComplianceProofVerified(propertyId, proofHash, valuationCommitment, principalCommitment)`.

Custom errors and revert conditions:

- `PropertyNotVerified(propertyId)` if the property is not verified.
- `InvalidPublicSignal(index, expected, actual)` for any public signal mismatch.
- `InvalidProof()` if generated verifier returns false.

Cross-contract calls:

- Reads `PropertyVerification.isVerified`.
- Reads `PropertyVerification.valuationCommitmentOf`.
- Calls generated `LtvGroth16Verifier.verifyProof`.
- Calls `PropertyVerification.setCompliant`.

Demo limitations:

- `MAX_LTV_BPS` is fixed at 8000.
- Proof freshness is not encoded.

Production considerations:

- Add expiry, nonce, or registry version binding if stale proofs must be impossible.

## Lending

Purpose: stores loan lifecycle state and enforces ownership, compliance, loan officer approval, and one active loan per property.

Roles:

- `DEFAULT_ADMIN_ROLE`: manages roles.
- `LOAN_OFFICER_ROLE`: may approve or reject requested loans.

Constructor:

```text
constructor(address verificationAddress, address admin)
```

If `admin` is zero, `msg.sender` becomes admin and initial loan officer.

Constants:

- `DEFAULT_INTEREST_RATE_BPS = 650`.
- `DEFAULT_TERM_DAYS = 365`.

Loan states:

- `Requested`
- `Approved`
- `Repaid`
- `Rejected`
- `Cancelled`

Public/external methods:

| Method | Access | Returns | State changes |
| --- | --- | --- | --- |
| `requestLoan(bytes32 propertyId, uint256 principalCommitment)` | property owner | `uint256 loanId` | Creates requested loan, locks property |
| `approveLoan(uint256 loanId)` | `LOAN_OFFICER_ROLE` | `bool approved` | Approves valid loan or auto-rejects invalid verification/compliance/proof binding |
| `rejectLoan(uint256 loanId)` | `LOAN_OFFICER_ROLE` | none | Rejects requested loan and releases lock |
| `cancelLoan(uint256 loanId)` | borrower | none | Cancels requested loan and releases lock |
| `repay(uint256 loanId)` | borrower | none | Marks approved loan repaid and releases lock |
| `getLoan(uint256 loanId)` | public view | `Loan` | none |
| `activeLoanIdOf(bytes32 propertyId)` | public view | `(uint256 loanId, bool exists)` | none |
| `loanIdsOfProperty(bytes32 propertyId)` | public view | `uint256[]` | none |

Events:

- `LoanRequested`.
- `LoanApproved`.
- `LoanRejected`.
- `LoanRejectedDueToVerification`.
- `LoanRejectedDueToCompliance`.
- `LoanRejectedDueToProofMismatch`.
- `LoanRepaid`.
- `LoanCancelled`.

Custom errors and revert conditions:

- `InvalidVerificationAddress()` for zero constructor verification address.
- `EmptyPropertyId()` for zero property key.
- `InvalidPrincipalCommitment()` for zero principal commitment.
- `NotPropertyOwner(propertyId, caller, owner)` if caller does not own the verified property record.
- `ActiveLoanExists(propertyId, loanId)` if the property is already locked.
- `InvalidLoanId(loanId)` if the ID has not been created.
- `InvalidLoanState(loanId, expected, actual)` for invalid lifecycle transitions.
- `NotBorrower(loanId, caller)` for borrower-only cancellation or repayment violations.
- OpenZeppelin `AccessControlUnauthorizedAccount` for loan officer enforcement.

Cross-contract calls:

- `ownerOf` during request.
- `isVerified`, `isCompliant`, and `isCompliantFor` during approval.

Demo limitations:

- No ETH/ERC20 disbursement.
- Interest rate and term are fixed constants.
- Repayment is a state transition only.

Production considerations:

- Add asset transfer, repayment accounting, delinquency, liquidation, and risk controls before real use.

## RoleAdminManager

Purpose: coordinates protocol admin grants/revocations across `PropertyVerification`, `Lending`, and itself, with last-admin protection.

Constructor:

```text
constructor(address propertyVerificationAddress, address lendingAddress, address admin)
```

Public/external methods:

| Method | Access | Returns | State changes |
| --- | --- | --- | --- |
| `grantProtocolAdmin(address account)` | `DEFAULT_ADMIN_ROLE` | none | Grants admin on manager, property verification, and lending |
| `revokeProtocolAdmin(address account)` | `DEFAULT_ADMIN_ROLE` | none | Revokes admin on property verification, lending, and manager |
| `hasProtocolAdmin(address account)` | public view | `(managerAdmin, propertyAdmin, lendingAdmin, complete)` | none |

Events:

- `ProtocolAdminGranted(account, sender)`.
- `ProtocolAdminRevoked(account, sender)`.

Custom errors and revert conditions:

- `InvalidManagedContract()` for zero managed contract address.
- `InvalidAccount()` for zero account or revoking the manager itself.
- `LastProtocolAdmin()` when revocation would remove the final manager admin.
- OpenZeppelin `AccessControlUnauthorizedAccount` for unauthorized calls.

Cross-contract calls:

- Calls `grantRole(0x00, account)` and `revokeRole(0x00, account)` on `PropertyVerification` and `Lending`.

Demo limitations:

- Coordinates two managed contracts only.

Production considerations:

- Consider timelocks, multisig administration, and emergency pause policies.

## LtvGroth16Verifier

Purpose: generated Solidity verifier for the `ltv.circom` Groth16 circuit.

Primary method:

```text
verifyProof(uint256[2] a, uint256[2][2] b, uint256[2] c, uint256[4] publicSignals) returns (bool)
```

Access:

- Public view. It does not manage roles or write state.

State changes:

- None.

Demo limitations:

- Generated from the current prototype proving key.

Production considerations:

- Regenerate only from a documented trusted setup or migrate to a proof system whose setup assumptions match the deployment requirements.
