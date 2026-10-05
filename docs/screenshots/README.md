# DApp Screenshot Evidence

These screenshots are the local DApp visual evidence pack for ProofEstate. They were captured against the local Hardhat and Oracle workflow and complement the CLI, test, benchmark, and gas evidence.

| File | Evidence shown |
| --- | --- |
| `01-property-verification-success.png` | `PROP-001` verification completed with property data, verification rules, on-chain record, valuation commitment, and proof status |
| `02-property-verification-rejection-case.png` | `PROP-010` inactive registry status case showing verification waiting state and unverified on-chain record |
| `03-zk-compliance-proof-verified.png` | ZK compliance proof completed for principal `750000`, LTV `76.5%`, reusable on-chain proof, and matched proof binding |
| `04-borrower-loan-lifecycle.png` | Borrower loan request and repayment workspace with loan details, proof binding, collateral lock, and lifecycle ledger |
| `05-loan-officer-approval-workspace.png` | Loan officer approval workspace with loan book, approval decision, commitments, terms, and timeline |
| `06-admin-role-access-management.png` | Admin role access management, role directory, grant/revoke controls, target inspector, and role change records |
| `07-contract-network-operations.png` | Contract and network operations view with service metrics, contract coverage `5/5`, RPC ready, Oracle service ready, and contract matrix |
| `08-audit-logs-overview.png` | Audit logs overview with portfolio metrics, issued exposure, on-chain activity, proof coverage, permission changes, and loan ledger |
| `09-onchain-event-traceability.png` | On-chain event traceability with proof/property/loan events, event fields, operator role, contract address, block, and transaction hash |

The DApp prevents borrowers from submitting a principal above the calculated maximum borrow amount. This screenshot pack includes a browser-level verification rejection case; above-limit LTV remains covered by the CLI/API failure path and contract/oracle tests.
