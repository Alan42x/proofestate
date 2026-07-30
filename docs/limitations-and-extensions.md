# Limitations and Extensions

This document separates what ProofEstate implements from what a production lending system would still require. The distinction is important for dissertation defense: out-of-scope items are not hidden defects, but deliberate boundaries of the prototype.

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

| Limitation | Explanation | Dissertation treatment |
| --- | --- | --- |
| Mock registry | Property records are JSON files, not production land-title data | State clearly as an experimental data source |
| Centralized Oracle | One service interprets registry facts and submits writes | Treat as trusted component in threat model |
| Prototype trusted setup | Groth16 artifacts are suitable for demonstration, not production ceremony | Discuss setup risk and future alternatives |
| No KYC/AML/DID | Borrower identity compliance is not implemented | Mark as outside lending-rule proof scope |
| No real disbursement | Loan approval does not transfer ETH or ERC20 tokens | Avoid claiming financial settlement |
| No liquidation | Delinquency, auctions, and collateral recovery are absent | Future work, not MVP functionality |
| No credit risk engine | The only compliance rule is LTV | Explain narrow rule as intentional |
| No production monitoring | No indexer, alerting, incident response, or operations tooling | Suitable for prototype only |
| Limited wallet UX | The frontend handles expected demo states, not all wallet edge cases | Demo limitation |
| No proof freshness | Proofs are not bound to nonce, expiry, borrower, or loan ID | Residual replay/freshness risk |
| Deterministic valuation salt | Helps reproducibility but may create linkability | Privacy limitation |

## Future Extensions

| Extension | Purpose | Likely complexity |
| --- | --- | --- |
| Signed registry attestations | Replace mock registry trust with verifiable source data | Medium |
| Threshold Oracle network | Reduce trust in one Oracle service | High |
| Proof freshness | Add nonce, expiry, loan ID, or registry version binding | Medium |
| Production identity layer | Add KYC, AML, DID, or credential proofing | High |
| Additional compliance rules | Prove borrower, property, jurisdiction, or exposure constraints | Medium to high |
| Alternative ZK systems | Evaluate PLONK, universal setup, or STARK-style proofs | Medium |
| Real settlement | Add ETH/ERC20 disbursement and repayment accounting | High |
| Liquidation and risk engine | Model delinquency, auctions, loan-to-value changes, and risk monitoring | High |
| Governance hardening | Add multisig, timelock, pause, and operational roles | Medium |
| Indexing and monitoring | Add event indexing, dashboards, and alerts | Medium |

## Most Valuable Next Extensions

For a research continuation, the highest-value extensions are:

1. proof freshness through registry version and loan-specific nonce;
2. signed registry attestations;
3. threshold Oracle verification;
4. additional compliance rules in the same proof pipeline;
5. comparison with a universal-setup proof system.

These directly strengthen the research contribution without turning the prototype into a full lending platform.
