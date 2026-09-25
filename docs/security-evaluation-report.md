# Security Evaluation Report

## Scope and Security Claim

This report evaluates ProofEstate as a dissertation prototype. The system demonstrates that a borrower can request a loan against a verified property while proving one LTV rule without publishing the property valuation or requested principal on-chain.

The security claim is intentionally bounded:

```text
If the Oracle writes a correct property verification record and the Groth16 verifier corresponds to circuits/ltv.circom, then Lending approves only a property/principal commitment pair that has passed the 80% LTV proof and current on-chain binding checks.
```

This is not a production security claim. The MVP does not implement production identity, real asset transfer, liquidation, monitoring, decentralized oracle consensus, or a production trusted setup ceremony.

## Protected Assets

| Asset | Protection goal |
| --- | --- |
| Property valuation | Avoid publishing plaintext valuation on-chain |
| Loan principal | Avoid publishing plaintext requested principal on-chain |
| Valuation and principal salts | Keep witness material off-chain |
| Compliance state | Ensure only valid proof-bound compliance is written |
| Property ownership binding | Ensure only the recorded owner can request a loan |
| Active loan lock | Prevent duplicate active borrowing against one property |
| Role permissions | Restrict Oracle, compliance, loan officer, and admin actions |
| Oracle private key | Prevent unauthorized verification writes |
| Hosted Oracle API gas budget | Prevent unintended public testnet transactions or prover workload |
| RPC and deployment secrets | Prevent unauthorized public network actions |

## Trust Assumptions

| Assumption | Role in the system | Consequence if false |
| --- | --- | --- |
| Oracle evaluates the registry honestly | Writes verification and proof transactions | False property facts could be committed |
| Mock registry files are correct for the demo | Source of property facts | Demo evidence may not match intended facts |
| Generated verifier matches `ltv.circom` | Validates the intended LTV statement | Proofs may enforce the wrong statement |
| Groth16 setup artifacts are acceptable for prototype use | Enables proof generation and verification | Toxic waste compromise would undermine proof soundness |
| Ethereum/Hardhat execution is correct | Enforces contract state transitions | Contract results would be unreliable |
| Wallet private keys remain controlled | Authorizes role and borrower actions | Unauthorized actions could be submitted |
| Frontend is untrusted convenience | UI does not provide security boundary | Contracts and API must validate inputs |

## Threat Model

The attacker may:

- call public contract methods directly;
- call Oracle API endpoints with malformed or inconsistent inputs;
- submit proof calldata generated for another property or principal;
- tamper with public signals;
- attempt to reuse a proof after property verification changes;
- attempt to request more than one active loan for a property;
- act from a wallet without the required role;
- act as a malicious or mistaken loan officer;
- call a hosted Oracle API with write-enabled requests to consume prover resources or testnet gas;
- obtain stale frontend configuration.

The attacker is not assumed to:

- break Ethereum consensus;
- break the cryptographic soundness of Groth16 under valid setup assumptions;
- compromise the local machine running the trusted Oracle;
- compromise private keys outside the application model.

## Implemented Mitigations

| Threat | Mitigation | Evidence |
| --- | --- | --- |
| Unauthorized property verification | `setVerified` requires `ORACLE_ROLE` | Contract tests |
| Unauthorized compliance write | `setCompliant` requires `COMPLIANCE_ROLE`; deployment grants it to `ComplianceVerifier` | Contract tests |
| Invalid property key signal | `ComplianceVerifier` checks signal 0 against `propertyIdToField(propertyId)` | Contract tests |
| Valuation commitment mismatch | Signal 1 must equal on-chain `valuationCommitmentOf(propertyId)` | Contract tests |
| Principal commitment mismatch | Signal 2 must equal submitted `principalCommitment` | Contract tests |
| LTV threshold tampering | Signal 3 must equal fixed `MAX_LTV_BPS = 8000` | Contract tests |
| Tampered Groth16 proof | Generated verifier must return true or `InvalidProof` reverts | Contract tests |
| Proof replay across property IDs | Property field and valuation commitment binding reject mismatches | Contract tests |
| Stale compliance after property refresh | `setVerified` clears compliant state and principal binding | Contract tests |
| Loan approval against wrong principal | `approveLoan` requires `isCompliantFor(propertyId, principalCommitment)` | Contract tests |
| Duplicate active collateral use | `activeLoanByProperty` rejects second active loan | Contract tests |
| Unauthorized approval/rejection | Loan officer methods require `LOAN_OFFICER_ROLE` | Contract tests |
| Unauthorized cancellation/repayment | Borrower-only checks in `cancelLoan` and `repay` | Contract tests |
| Last admin removal | `RoleAdminManager` prevents removing final admin | Contract tests |
| Malformed property/principal input | Oracle validates network, property ID, and principal types/ranges | Oracle API tests |
| Unsupported network access | Dataset access is restricted to `localhost` and `sepolia` | Oracle API tests |

## Code Review and Adversarial Testing Matrix

The security review was performed as a bounded prototype review rather than a production audit. The review checked role boundaries, proof public-signal binding, state-transition invariants, Oracle API input validation, hosted-API exposure, and runtime-secret handling. The review did not include a third-party audit, fuzzing campaign, formal verification, or production key-management review.

| Category | Adversarial scenario | Expected behavior | Evidence |
| --- | --- | --- | --- |
| Role boundary | Non-oracle account attempts to write property verification | Transaction reverts | Contract tests |
| Role boundary | Direct compliance write bypasses `ComplianceVerifier` | Transaction reverts | Contract tests |
| Role boundary | Non-loan-officer attempts approval or rejection | Transaction reverts | Contract tests |
| Admin safety | Final protocol admin is removed | Transaction reverts | Contract tests |
| Proof binding | Proof public signal uses a different property identifier | Compliance update reverts | Contract tests |
| Proof binding | Proof public signal uses a stale valuation commitment | Compliance update reverts or stale state is cleared on refresh | Contract tests |
| Proof binding | Proof public signal uses a different principal commitment | Compliance update or loan approval is rejected | Contract tests |
| Policy binding | Public signal changes the LTV threshold | Compliance update reverts | Contract tests |
| Proof integrity | Groth16 proof calldata is tampered with | Generated verifier rejects the proof | Contract tests |
| Boundary correctness | Principal is exactly `784000` for `PROP-001` | Accepted at exactly 80% LTV | Benchmark correctness matrix |
| Boundary correctness | Principal is `784001` for `PROP-001` | Rejected without proof generation | Benchmark correctness matrix |
| Registry failure | `PROP-004` fails registry validation | Rejected without proof generation | Oracle API tests; benchmark correctness matrix |
| Lifecycle state | Property verification is refreshed after compliance | Prior compliance and principal binding are cleared | Contract tests |
| Lifecycle state | Same property is reused while an active loan exists | Second active loan is rejected | Contract tests |
| Lifecycle state | Non-borrower attempts cancellation or repayment | Transaction reverts | Contract tests |
| API input abuse | Unsupported network, missing property ID, non-string property ID, or invalid principal is submitted | API returns validation failure without server crash | Oracle API tests |
| Frontend readiness | Wallet/readiness controls are unavailable or disconnected | UI remains in guarded readiness state | Frontend tests |

This matrix supports the claim that security testing and adversarial testing were performed for the prototype scope. It should not be described as a formal audit or as evidence of production readiness.

## Hosted Oracle API Exposure

The hosted Oracle API is a demo/testnet service, not a production public transaction gateway. The current Express API accepts cross-origin requests and does not implement application-level authentication, rate limiting, request signing, or per-origin transaction policy.

When `write=true` is enabled, a public caller could ask the Oracle service to submit Sepolia verification or compliance transactions from the configured Oracle signer, subject to on-chain role checks and account balance. This does not bypass contract authorization, but it can consume Oracle gas, API resources, and proof-generation time.

For the dissertation prototype this risk is acceptable only because Sepolia is optional public validation and no real assets move. A production deployment should add API authentication, origin allowlisting, rate limiting, transaction allowlists, request quotas, monitoring, and explicit operator approval for privileged writes.

## Privacy Evaluation

The chain receives:

- property key;
- valuation commitment;
- principal commitment;
- proof hash;
- public proof signals;
- owner address;
- loan state.

The chain does not receive:

- plaintext property valuation;
- plaintext loan principal;
- valuation salt;
- principal salt;
- witness file contents.

Residual privacy risks:

- Commitments are linkable if the same salts and values are reused.
- Owner address and loan lifecycle state remain public.
- The centralized Oracle observes plaintext registry values and loan principal during proof generation.
- The current proof is not borrower-private; it proves LTV for a property/principal commitment pair.

## Replay and Freshness Analysis

The proof is bound to the property key field, valuation commitment, principal commitment, and max LTV parameter. This blocks replay across different property IDs, valuation commitments, principal commitments, or policy thresholds.

The proof is not currently bound to:

- borrower address;
- loan ID;
- timestamp;
- expiry;
- single-use nonce.

This means the same valid proof can be submitted again for the same property and principal commitment. In the MVP this is acceptable because it only refreshes the same compliance state. A production version should add proof freshness through an expiry, nonce, registry version, or loan-specific challenge.

## Role and Administration Risks

The protocol uses role-gated operations rather than ownership-only control:

- Oracle writes verification records.
- ComplianceVerifier writes compliance state.
- Loan officer approves or rejects loans.
- RoleAdminManager coordinates protocol admin grants.

The main administrative risk is operator mistake. `RoleAdminManager` prevents removing the last admin, but it does not provide multisig approval, timelock delay, or emergency pause. These controls are future work.

## Remaining Risks

- Centralized Oracle trust remains the largest limitation.
- The mock registry is not an authenticated land registry.
- The trusted setup is prototype-grade.
- Proof freshness is not enforced.
- No production key management is implemented.
- The hosted Oracle API has no production authentication, rate limiting, or transaction policy.
- No real disbursement or repayment transfer logic exists.
- No liquidation, delinquency, or credit risk logic exists.
- No production monitoring, indexing, alerting, or incident response exists.
- Sepolia secrets must remain outside git and outside dissertation artifacts.

## Future Security Improvements

- Signed registry attestations or direct registry integration.
- Threshold Oracle network for verification writes.
- Proof expiry, nonce, registry version, or loan-specific challenge.
- Multisig and timelock governance.
- Emergency pause for production operations.
- API authentication, rate limiting, request signing, and transaction policy for hosted Oracle writes.
- Formal verification or property-based testing for contract invariants.
- Dedicated security review before any real asset movement.
- Stronger privacy model for Oracle-observed plaintext values.

## Conclusion

ProofEstate implements the core security controls needed for a defensible prototype: role-gated writes, Groth16 verification, public signal binding, stale compliance clearing, principal-specific approval, and active collateral locking. The remaining risks are material, but they are aligned with the declared MVP scope and should be presented as limitations rather than hidden assumptions.
