# Limitations, Extensions, and Generalization

This document separates what ProofEstate implements from what a production lending system would still require. It also collects candidate applications of the proof-to-state binding pattern. Implemented mechanisms, observed limitations, and hypothetical extensions are distinguished throughout.

## Implemented Scope

ProofEstate implements:

- mock property registry lookup;
- deterministic Oracle verification rules;
- MiMC valuation and principal commitments;
- Groth16 proof generation for an 80% LTV rule;
- on-chain public signal binding;
- role-gated property verification and compliance writes;
- loan request, approval, rejection, cancellation, repayment, and active property locking;
- React DApp and local CLI demo paths.

## Current Limitations

| Limitation | Observed boundary | Implication |
| --- | --- | --- |
| Mock registry | Property records are JSON files, not production land-title data | The evaluation does not establish the authenticity of real property records |
| Centralized Oracle | One service interprets registry facts and submits writes | Proof verification does not independently establish the truth of external facts |
| Prototype trusted setup | The local setup script uses demonstration contributions; no audited ceremony is established | Proof soundness remains conditional on an uncompromised setup |
| No KYC/AML/DID | Borrower identity compliance is not implemented | The LTV proof establishes no identity or credential predicate |
| No real disbursement | Loan approval does not transfer ETH or ERC20 tokens | State transitions provide no evidence of financial settlement |
| No liquidation | Delinquency, auctions, and collateral recovery are absent | Default handling is outside the evaluated loan lifecycle |
| No credit risk engine | The only compliance rule is LTV | Passing the rule is not a creditworthiness assessment |
| No production monitoring | No indexer, alerting, incident response, or operations tooling | Operational resilience is outside the evaluation |
| Limited wallet UX | The frontend handles expected demo states, not all wallet edge cases | Component tests do not establish complete browser/wallet coverage |
| No proof freshness | No nonce, expiry, borrower, loan ID, registry version, chain ID, or deployment-address binding | An identical proof can restore compliance after a refresh retaining the valuation commitment |
| Deterministic valuation salt | Public context can permit candidate valuation testing | Commitment hiding is not established |
| Registry and API disclosure | Mock records and unauthenticated responses expose values and salts | The demonstrated disclosure property is omission of financial plaintext from the blockchain |
| Approval ownership continuity | Ownership is checked at request, without an approval-time recheck | An original borrower's pending request can still be approved after an authorized owner change and proof resubmission |
| Mutable compliance slot | Another principal can replace the property's single compliance record | A subsequent approval attempt rejects an old mismatched request and releases its lock; replacement alone does not transition the loan |
| Post-approval refresh | Refresh does not revalidate approved loans | Approval is a snapshot, not continuous collateral monitoring |

The [functional test suite](evaluation-notes.md#functional-evaluation) exercises the lifecycle boundaries. The [security evaluation](security-evaluation-report.md#lifecycle-security-boundaries) describes their trust and disclosure implications.

## Future Extensions

The following items are proposed research and engineering work. Complexity labels are qualitative estimates, not measured delivery effort.

| Extension | Purpose | Estimated complexity |
| --- | --- | --- |
| Signed registry attestations | Authenticate source records instead of relying on local JSON files | Medium |
| Threshold Oracle network | Reduce trust in one Oracle service | High |
| Proof freshness | Prove and validate a nonce, expiry, loan ID, registry version, and deployment domain as required by the application | Medium |
| Production identity layer | Add KYC, AML, DID, or credential proofing | High |
| Additional compliance rules | Prove borrower, property, jurisdiction, or exposure constraints | Medium to high |
| Alternative ZK systems | Compare Groth16 with a PLONK-style universal/updatable SRS or a transparent STARK-style system | Medium |
| Real settlement | Add ETH/ERC20 disbursement and repayment accounting | High |
| Liquidation and risk engine | Model delinquency, auctions, loan-to-value changes, and risk monitoring | High |
| Governance hardening | Add multisig, timelock, pause, and operational roles | Medium |
| Indexing and monitoring | Add event indexing, dashboards, and alerts | Medium |

## Most Valuable Next Extensions

For a research continuation, the highest-value extensions are:

1. authenticated, restricted API responses and secret valuation blinding;
2. loan-specific proof freshness and approval-time ownership validation;
3. signed source attestations and a documented setup model;
4. matched baselines and measurements of proof-to-state binding costs;
5. additional policies, threshold attestations, or alternative proof systems after the current boundaries are addressed.

The priorities address the observed disclosure and lifecycle boundaries before expanding policy scope.

## Generalization

The proof-to-state binding pattern provides a basis for investigating other compliance and verification applications.

These candidate applications are proposals, not implemented or evaluated capabilities. ProofEstate's current disclosure and lifecycle limitations must be addressed before claiming confidentiality in another application. The reusable pattern is:

```text
private facts
-> trusted or attested data source
-> commitment
-> zero-knowledge proof of a policy rule
-> on-chain or auditable verification
-> application state transition
```

### Reusable Architectural Components

| Component | ProofEstate role | Generalized role |
| --- | --- | --- |
| Data source | Mock property registry | Registry, issuer, employer, bank, insurer, credential provider |
| Oracle | Reads property data and builds proof inputs | Bridges external facts into verifiable commitments |
| Commitment | Refers to valuation and principal; hiding is not established for current valuation salts | Binds attributes; hiding requires suitable secret randomness and restricted interfaces |
| ZK circuit | Proves 80% LTV compliance | Proves threshold, membership, eligibility, or policy satisfaction |
| Verifier contract | Checks Groth16 proof and public signals | Enforces a proof-backed policy result on chain |
| Application contract | Controls loan lifecycle | Controls access, approval, payout, audit, or credential state |
| DApp | Demo surface for lending flow | User-facing portal for proof submission and status tracking |

### Candidate Applications

#### Privacy-Preserving Income Verification

A borrower could prove income is above a lender's threshold without publishing salary. The Oracle or issuer would derive a commitment from payroll data, and the circuit would prove:

```text
annualIncome >= requiredIncome
```

Additional requirements:

- signed employer or payroll attestations;
- proof freshness;
- borrower identity binding;
- revocation or update policy.

#### KYC or Accredited-Investor Eligibility

A user could prove they satisfy a regulatory or platform eligibility rule without exposing the full identity document or financial profile.

Possible private inputs:

- jurisdiction;
- age;
- accreditation status;
- credential expiry;
- issuer signature witness.

Public outputs should reveal only the minimum needed result, such as an eligibility commitment or policy identifier.

#### Insurance Claim Verification

An insured party could prove that a claim satisfies policy constraints without revealing all supporting documents publicly.

Example rules:

- claim amount below covered limit;
- event date within coverage period;
- policy active at time of event;
- deductible satisfied.

This would require stronger document authentication and dispute handling than ProofEstate.

#### Asset-Backed Lending

The same commitment and proof-binding pattern could apply to other collateral types:

- vehicles;
- invoices;
- tokenized funds;
- equipment;
- receivables.

The main change is the data-source trust model. Each asset class needs a credible registry or attestation provider.

#### Privacy-Preserving Compliance for Marketplaces

Marketplaces could use similar proofs to check seller or asset eligibility without publishing sensitive commercial data.

Examples:

- seller revenue above threshold;
- inventory authenticity attestation;
- restricted-product compliance;
- region-specific eligibility.

### Required Changes for Production Generalization

ProofEstate's current MVP would need several hardening steps before reuse in high-stakes settings:

- replace mock registry data with authenticated external attestations;
- add proof freshness through nonce, expiry, registry version, or loan-specific challenge;
- reduce centralized Oracle trust through threshold Oracle design or signed source credentials;
- implement production key management and secret rotation;
- add monitoring, indexing, alerting, and incident response;
- document or replace the trusted setup;
- bind proofs to user identity or session where replay would be harmful;
- conduct formal security review before handling real assets.

### Generalization Claim

The reusable contribution is the proof-to-state binding pattern:

```text
Sensitive external facts can be committed off chain, proven against a narrow compliance rule in zero knowledge, and used to drive auditable smart-contract state without publishing the plaintext inputs on chain.
```

Confidentiality beyond the blockchain requires authenticated data handling, suitable secret blinding, and restricted interfaces. Those properties are not established by the current mock-registry and API implementation.
