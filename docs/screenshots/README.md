# DApp Screenshot Evidence

These screenshots show ProofEstate's local Hardhat DApp and Oracle workflow.
They illustrate interface states, contract records, and event inspection;
automated behavior and performance results are documented in the
[evaluation notes](../evaluation-notes.md) and
[benchmark results](../benchmarks/final-benchmarks.md).

| File | Evidence shown |
| --- | --- |
| [01-property-verification-success.png](01-property-verification-success.png) | `PROP-001` verified record, registry-rule results, valuation commitment, and recorded compliance status |
| [02-property-verification-rejection-case.png](02-property-verification-rejection-case.png) | `PROP-010` with INACTIVE registry status, Waiting workflow labels, and an Unverified contract record |
| [03-zk-compliance-proof-verified.png](03-zk-compliance-proof-verified.png) | Accepted compliance for principal `750000` against valuation `980000`, displayed LTV `76.5%`, and matching commitments |
| [04-borrower-loan-lifecycle.png](04-borrower-loan-lifecycle.png) | Selected Approved loan with a held lock; ledger also shows Repaid, Cancelled, and Rejected loans |
| [05-loan-officer-approval-workspace.png](05-loan-officer-approval-workspace.png) | Officer workspace with an Approved loan selected, commitments, terms, timeline, and decision controls |
| [06-admin-role-access-management.png](06-admin-role-access-management.png) | Role directory, grant/revoke controls, change records, and a blocked revoke for an address without the selected role |
| [07-contract-network-operations.png](07-contract-network-operations.png) | Five deployed contracts, RPC and Oracle readiness, and metrics from the captured UI session |
| [08-audit-logs-overview.png](08-audit-logs-overview.png) | Loan-state and lock counts, event counts, role changes, and a loan ledger |
| [09-onchain-event-traceability.png](09-onchain-event-traceability.png) | Selected `ComplianceProofVerified` event with commitments, proof hash, operator, contract address, block, and transaction hash |

The inactive-registry screenshot shows a failing registry condition and an
unverified record; it does not include a rejection dialog or transaction trace.
Above-limit principals disable proof generation in the DApp. API rejection and
direct circuit boundary behavior are exercised by automated tests.

The UI's `5/5` contract count describes deployment availability, not test coverage.
Its displayed timing and gas values belong to the captured session; formal
measurements come from the benchmark harness. Valuation and principal shown in
the interface are off-chain mock data. Repayment records a state change and
releases the lock without transferring assets.
