# Demo Screenshot Index

These screenshots are the local DApp fallback evidence pack for the ProofEstate defense demo. They were captured against the local Hardhat and Oracle workflow.

| File | Evidence shown |
| --- | --- |
| `01-wallet-readiness.png` | Wallet connected on localhost, runtime readiness, RPC, Oracle API, contracts, and wallet network all ready |
| `02-property-verified-onchain-record.png` | `PROP-001` property verification completed with on-chain record, valuation commitment, and verified status |
| `03-compliance-proof-success.png` | ZK compliance proof completed for principal `750000`, LTV shown as below the `784000` maximum borrow amount, proof binding matched |
| `04-loan-requested.png` | Borrower loan request submitted, state `Requested`, proof binding matched, and collateral lock active |
| `05-loan-officer-approval.png` | Loan officer view after approving loan `#0`, state `Approved`, proof binding matched, and approval timestamp recorded |
| `06-repayment-repaid.png` | Borrower repayment completed, state `Repaid`, repayment timestamp recorded, and collateral lock released |
| `07-admin-role-access-management.png` | Admin role access management, role directory, grant/revoke controls, role records, and admin readiness |
| `08-contract-readiness-settings.png` | Contract and network operations view with service metrics, contract coverage `5/5`, RPC ready, and Oracle service ready |
| `09-event-audit-log.png` | Audit log with loan ledger, on-chain event log, proof/asset coverage, permission changes, and final `Repaid` state |

The DApp prevents borrowers from submitting a principal above the calculated maximum borrow amount. Above-limit LTV remains covered by the CLI/API failure path in the demo checklist rather than by a DApp screenshot.
