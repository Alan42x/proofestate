# Smart Contract Interface Spec

This specification describes the protocol methods and their state semantics in the [Solidity sources](../contracts). The method tables list application operations; Solidity also generates getters for public constants and variables. `PropertyVerification`, `Lending`, and `RoleAdminManager` inherit OpenZeppelin `AccessControl`, including `hasRole`, `getRoleAdmin`, `grantRole`, `revokeRole`, `renounceRole`, and `supportsInterface`.

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

The selected admin receives both `DEFAULT_ADMIN_ROLE` and `ORACLE_ROLE`. If `admin` is zero, `msg.sender` is selected.

`getRecord` returns fields in this order: `bool verified`, `bool compliant`, `address owner`, `bytes32 evidenceHash`, `bytes32 complianceHash`, `uint256 valuationCommitment`, `uint256 principalCommitment`, `uint64 lastUpdated`. An unwritten property returns the zero-initialized record.

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

Every `setVerified` call clears `compliant`, `complianceHash`, and `principalCommitment`, including a refresh that preserves the valuation commitment. A false verification stores a zero valuation commitment. `setCompliant` requires a verified property even when clearing compliance; a false compliance value clears the stored proof hash and principal commitment. Its event retains the supplied `proofHash` argument.

`isCompliant` requires both verification and compliance. `isCompliantFor` additionally compares the stored principal commitment with the argument. `ownerOf` returns the recorded address independently of verification status.

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
- Each property has one compliance slot tagged with one principal commitment; a later write replaces it.
- Administrators can grant `COMPLIANCE_ROLE` to additional writers. Proof-backed compliance therefore depends on maintaining the designated-verifier role configuration.

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

The property must already be verified. Any caller may submit a proof; only the wrapper needs `COMPLIANCE_ROLE` on `PropertyVerification`. Signal 2 is compared with the method argument, without looking up a pending loan. On success, the wrapper stores `keccak256(abi.encode(a, b, c, publicSignals))` as the proof hash and returns `true`; a failed check reverts.

Generated getters expose `propertyVerification`, `ltvVerifier`, `MAX_LTV_BPS`, and `SNARK_SCALAR_FIELD`.

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

Purpose: stores loan lifecycle state, checks recorded ownership at request, checks verification and principal-matched compliance at approval, and holds one active loan lock per property.

Roles:

- `DEFAULT_ADMIN_ROLE`: manages roles.
- `LOAN_OFFICER_ROLE`: may approve or reject requested loans.

Constructor:

```text
constructor(address verificationAddress, address admin)
```

The selected admin receives both `DEFAULT_ADMIN_ROLE` and `LOAN_OFFICER_ROLE`. If `admin` is zero, `msg.sender` is selected.

Constants:

- `DEFAULT_INTEREST_RATE_BPS = 650`.
- `DEFAULT_TERM_DAYS = 365`.

Loan states:

- `Requested = 0`
- `Approved = 1`
- `Repaid = 2`
- `Rejected = 3`
- `Cancelled = 4`

`getLoan` returns fields in this order: `address borrower`, `bytes32 propertyId`, `uint256 principalCommitment`, `uint256 interestRateBps`, `uint256 termDays`, `LoanState state`, `uint256 requestedAt`, `uint256 approvedAt`, `uint256 repaidAt`. Loan IDs start at zero; use the `exists` flag from `activeLoanIdOf` to distinguish an unlocked property from active loan 0.

Public/external methods:

| Method | Access | Returns | State changes |
| --- | --- | --- | --- |
| `requestLoan(bytes32 propertyId, uint256 principalCommitment)` | recorded property owner | `uint256 loanId` | Creates requested loan, locks property |
| `approveLoan(uint256 loanId)` | `LOAN_OFFICER_ROLE` | `bool approved` | Approves a requested loan if verification and stored principal-matched compliance hold; otherwise rejects it and releases its lock |
| `rejectLoan(uint256 loanId)` | `LOAN_OFFICER_ROLE` | none | Rejects requested loan and releases lock |
| `cancelLoan(uint256 loanId)` | borrower | none | Cancels requested loan and releases lock |
| `repay(uint256 loanId)` | borrower | none | Marks approved loan repaid and releases lock |
| `getLoan(uint256 loanId)` | public view | `Loan` | none |
| `activeLoanIdOf(bytes32 propertyId)` | public view | `(uint256 loanId, bool exists)` | none |
| `loanIdsOfProperty(bytes32 propertyId)` | public view | `uint256[]` | none |

Request requires a nonzero property ID, nonzero principal commitment, the recorded owner as caller, and no active property lock. It does not require verified or compliant state. The DApp's guided order does not add a contract guard.

Approval requires an existing `Requested` loan and the officer role. Invalid role, ID, or lifecycle state reverts without a transition. An unverified property, missing compliance, or mismatched principal instead moves the loan to `Rejected`, releases the lock, emits its specific rejection event, and returns `false`. Successful approval retains the lock and returns `true`; no Groth16 verification or ownership recheck occurs in `approveLoan` itself.

Changing compliance does not immediately transition a pending loan. If another principal replaces the compliance slot, a subsequent approval attempt rejects the old request. Verification refreshes do not change an already approved loan or release its lock.

Generated getters expose `propertyVerification`, `nextLoanId`, `LOAN_OFFICER_ROLE`, and the term constants.

Events:

- `LoanRequested(loanId, borrower, propertyId, principalCommitment)`.
- `LoanApproved(loanId, propertyId)`.
- `LoanRejected(loanId, propertyId)`.
- `LoanRejectedDueToVerification(loanId, propertyId)`.
- `LoanRejectedDueToCompliance(loanId, propertyId)`.
- `LoanRejectedDueToProofMismatch(loanId, propertyId, principalCommitment)`.
- `LoanRepaid(loanId, borrower)`.
- `LoanCancelled(loanId, propertyId, borrower)`.

Custom errors and revert conditions:

- `InvalidVerificationAddress()` for zero constructor verification address.
- `EmptyPropertyId()` for zero property key.
- `InvalidPrincipalCommitment()` for zero principal commitment.
- `NotPropertyOwner(propertyId, caller, owner)` if caller differs from the recorded owner, regardless of verification status.
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
- Interest rate and term are recorded constants; no interest accrual or repayment accounting is implemented.
- Repayment is a state transition only.

Production considerations:

- Add asset transfer, repayment accounting, delinquency, liquidation, and risk controls before real use.

## RoleAdminManager

Purpose: coordinates atomic admin grants/revocations across `PropertyVerification`, `Lending`, and itself, while retaining at least one administrator on the manager.

Constructor:

```text
constructor(address propertyVerificationAddress, address lendingAddress, address admin)
```

If `admin` is zero, `msg.sender` becomes the initial manager admin. The manager must hold the admin role on both managed contracts for coordinated role changes to succeed.

Public/external methods:

| Method | Access | Returns | State changes |
| --- | --- | --- | --- |
| `grantProtocolAdmin(address account)` | `DEFAULT_ADMIN_ROLE` | none | Grants admin on manager, property verification, and lending |
| `revokeProtocolAdmin(address account)` | `DEFAULT_ADMIN_ROLE` | none | Revokes admin on property verification, lending, and manager |
| `hasProtocolAdmin(address account)` | public view | `(managerAdmin, propertyAdmin, lendingAdmin, complete)` | none |

`complete` is the conjunction of the three returned role memberships. Generated getters expose `propertyVerification`, `lending`, and `protocolAdminCount`; the count covers manager administrators only. If any cross-contract operation fails, the whole grant/revoke transaction rolls back.

Events:

- `ProtocolAdminGranted(account, sender)`.
- `ProtocolAdminRevoked(account, sender)`.

Custom errors and revert conditions:

- `InvalidManagedContract()` for zero managed contract address.
- `InvalidAccount()` for a zero admin grant, or for zero account/manager-self removal through `revokeProtocolAdmin`.
- `LastProtocolAdmin()` when revocation would remove the final manager admin.
- OpenZeppelin `AccessControlUnauthorizedAccount` for unauthorized calls.

Cross-contract calls:

- Calls `grantRole(0x00, account)` and `revokeRole(0x00, account)` on `PropertyVerification` and `Lending`.

Demo limitations:

- Coordinates two managed contracts only.
- Final-manager-admin protection also applies to inherited `revokeRole` and `renounceRole`. Direct role operations can still leave partial administration across contracts; the manager count does not guarantee a remaining account with all three admin roles.

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
