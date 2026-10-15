# Security Evaluation Report

## Scope and Security Claim

This report evaluates ProofEstate's proof binding, access control, and loan lifecycle. Loan approval requires current property verification and stored compliance matching the request's principal commitment. The proof enforces one LTV rule without publishing the property valuation or requested principal on-chain. A request itself checks recorded ownership and locking, rather than verification or compliance.

The security claim is intentionally bounded:

```text
Assuming Groth16 soundness, uncompromised setup, commitment binding,
noncolliding property-field contexts, an honest oracle valuation record,
and maintained roles in which only the designated
verifier writes compliance, approval requires current property verification
and a compliant record for the request's principal commitment that passed
the 80% LTV relation and current valuation-commitment binding checks.
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
| Oracle evaluates the registry honestly | Writes verification and constructs proof inputs | False property facts could be committed |
| Mock registry files are correct for the demo | Source of property facts | Demo evidence may not match intended facts |
| Generated verifier matches `ltv.circom` | Validates the intended LTV statement | Proofs may enforce the wrong statement |
| Groth16 setup remains uncompromised | Enables sound proof verification; the local setup script is not an audited ceremony | Toxic waste compromise would undermine proof soundness |
| Property-field contexts do not collide and commitments remain binding | Separates records and binds financial inputs | Distinct application contexts could share an accepted proof statement |
| Only the designated verifier holds `COMPLIANCE_ROLE` | Links stored compliance to checked proofs | Another authorized writer could bypass proof verification |
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
| Final manager administrator removal | `RoleAdminManager` retains its final manager admin; managed-contract roles can still become partial | Contract tests |
| Malformed property/principal input | Oracle validates network, property ID, and principal types/ranges | Oracle API tests |
| Unsupported network access | Dataset access is restricted to `localhost` and `sepolia` | Oracle API tests |

## Code Review and Adversarial Testing Matrix

The security review was performed as a bounded prototype review rather than a production audit. The review checked role boundaries, proof public-signal binding, state-transition invariants, Oracle API input validation, hosted-API exposure, and runtime-secret handling. The review did not include a third-party audit, fuzzing campaign, formal verification, or production key-management review.

| Category | Adversarial scenario | Expected behavior | Evidence |
| --- | --- | --- | --- |
| Role boundary | Non-oracle account attempts to write property verification | Transaction reverts | Contract tests |
| Role boundary | Direct compliance write bypasses `ComplianceVerifier` | Transaction reverts | Contract tests |
| Role boundary | Non-loan-officer attempts approval or rejection | Transaction reverts | Contract tests |
| Manager admin retention | Final `RoleAdminManager` admin is removed | Transaction reverts | Contract tests |
| Proof binding | Proof public signal uses a different property identifier | Compliance update reverts | Contract tests |
| Proof binding | Proof public signal uses a stale valuation commitment | Compliance update reverts or stale state is cleared on refresh | Contract tests |
| Proof binding | Proof public signal uses a different principal commitment | Compliance update or loan approval is rejected | Contract tests |
| Policy binding | Public signal changes the LTV threshold | Compliance update reverts | Contract tests |
| Proof integrity | Groth16 proof calldata is tampered with | Generated verifier rejects the proof | Contract tests |
| Boundary correctness | Principal is exactly `784000` for `PROP-001` | Proof accepted on chain at exactly 80% LTV | Circuit arithmetic tests; benchmark matrix |
| Boundary correctness | Principal is `784001` for `PROP-001` | Oracle skips proving; direct over-limit witness fails a constraint | Circuit arithmetic tests; benchmark matrix |
| Registry failure | `PROP-004` fails registry validation | Rejected without proof generation | Oracle API tests; benchmark correctness matrix |
| Lifecycle state | Property verification is refreshed after compliance | Prior compliance and principal binding are cleared | Contract tests |
| Lifecycle state | Same property is reused while an active loan exists | Second active loan is rejected | Contract tests |
| Lifecycle state | Non-borrower attempts cancellation or repayment | Transaction reverts | Contract tests |
| API input abuse | Unsupported network, missing property ID, non-string property ID, or invalid principal is submitted | API returns validation failure without server crash | Oracle API tests |
| Frontend wallet gate | Wallet is disconnected or the app has not been entered | Wallet-gate component displays the corresponding state | Component tests; no full-app authorization claim |

The functional evaluation passed on 2026-10-15 under Node v22.22.1: 37 contract/circuit tests, 12 Oracle API tests, and 6 frontend component tests. Security and arithmetic cases belong to the complete contract/circuit suite. See [evaluation notes](evaluation-notes.md#functional-evaluation) for commands and [test/proofestate.test.js](../test/proofestate.test.js) for the contract assertions. Timing samples in the benchmark matrix do not independently verify every proof on chain.

## Hosted Oracle API Exposure

The hosted Oracle API is a demo/testnet service, not a production public transaction gateway. The current Express API accepts cross-origin requests and does not implement application-level authentication, rate limiting, request signing, or per-origin transaction policy.

When `write=true` is enabled, a public caller could ask the Oracle service to submit Sepolia verification or compliance transactions from the configured Oracle signer, subject to on-chain role checks and account balance. This does not bypass contract authorization, but it can consume Oracle gas, API resources, and proof-generation time.

No real settlement limits financial exposure but does not mitigate API disclosure, denial of service, or unauthorized use of the signer. Authentication, response restrictions, request quotas, transaction policies, monitoring, and protected key custody are required beyond controlled demonstration use. Property filters, self-declared role query parameters, and CORS do not authenticate the caller.

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
- The mock registry contains valuations, and compliant API responses expose valuation, principal, and both salts through `proofInputs`.
- Valuation salts are deterministically derived from available property context, allowing candidate testing. Strong application confidentiality is not established.

The demonstrated privacy property is omission of financial plaintext from the blockchain, not secrecy across the registry and API.

## Replay and Freshness Analysis

The proof is bound to the property key field, valuation commitment, principal commitment, and max LTV parameter. Substitution is rejected when these checked values differ. Property separation assumes noncolliding identifier/field contexts and commitment binding; modulo reduction is not injective over all `bytes32` values. The Keccak identifier mapping is performed outside the circuit.

The proof is not currently bound to:

- borrower address;
- loan ID;
- timestamp;
- expiry;
- single-use nonce.

An unchanged valuation commitment allows the same valid proof to restore compliance after a refresh. The proof also lacks registry-version, chain-ID, and deployment-address binding. A freshness design must prove and validate or consume the intended nonce/version/domain on chain.

## Lifecycle Security Boundaries

The contract/circuit suite checks cross-property substitution, policy tampering, arithmetic boundaries, and lifecycle behavior. Substitution and threshold tampering are rejected in the tested contexts. The following accepted behaviors delimit the security claim:

| Scenario | Contract behavior |
| --- | --- |
| Unchanged valuation refresh | Identical proof can restore cleared compliance |
| Oracle changes the owner after request, retaining the valuation commitment | Original borrower's request can be approved after proof resubmission |
| Another principal proof is accepted | Old pending request remains pending; a subsequent approval attempt rejects it and releases its active lock |
| Refresh follows approval | Approved state and active lock remain |

Ownership is checked only at request, compliance occupies one mutable slot per property, and approval is a snapshot rather than continuous monitoring.

## Role and Administration Risks

The protocol uses role-gated operations rather than ownership-only control:

- Oracle writes verification records.
- ComplianceVerifier writes compliance state.
- Loan officer approves or rejects loans.
- RoleAdminManager coordinates protocol admin grants.

`RoleAdminManager` prevents removal of its final manager administrator. Individual role methods can create partial administration across the managed contracts; the manager count does not establish complete administrative continuity. Multisignature approval, timelocks, and emergency controls are future work.

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

The evaluated controls enforce role-gated writes, Groth16 verification, public-signal binding, compliance clearing on refresh, principal-matched approval, and one active loan lock per property. The result is conditional proof-to-state enforcement. It does not establish confidential API access, proof freshness, ownership continuity at approval, or continuous collateral monitoring.
