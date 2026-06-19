# ProofEstate Evaluation Notes

Updated: 2026-06-19 18:25 +08

## Verification Status

The local implementation has been verified with:

```bash
pnpm test:all
pnpm test:gas
```

Results:

- Contract tests: 24 passing.
- Oracle API tests: 7 passing.
- Frontend tests: 6 passing.
- Frontend production build: passing.

## Gas Snapshot

Generated with:

```bash
REPORT_GAS=true hardhat test
```

| Contract | Method | Min gas | Max gas | Avg gas | Calls |
| --- | ---: | ---: | ---: | ---: | ---: |
| ComplianceVerifier | verifyProofAndSetCompliance | - | - | 310433 | 11 |
| Lending | approveLoan | 58252 | 93881 | 81464 | 12 |
| Lending | cancelLoan | - | - | 52694 | 2 |
| Lending | rejectLoan | - | - | 52620 | 2 |
| Lending | repay | - | - | 57219 | 5 |
| Lending | requestLoan | 224733 | 241833 | 233609 | 18 |
| PropertyVerification | setVerified | 46738 | 121950 | 115996 | 16 |

Deployment gas:

| Contract | Avg gas | Block limit share |
| --- | ---: | ---: |
| ComplianceVerifier | 417315 | 0.7% |
| Lending | 1152092 | 1.9% |
| LtvGroth16Verifier | 411178 | 0.7% |
| PropertyVerification | 771511 | 1.3% |

## Re-entrancy Assessment

Re-entrancy is not an active risk in the current MVP because `Lending` does not transfer ETH, transfer ERC20 tokens, or call borrower-controlled contracts. Repayment is modeled as a state transition only, and the loan state is updated without external calls.

If the MVP later adds real asset disbursement, repayment transfers, ERC20 collateral, or liquidation callbacks, then `Lending` should add a dedicated re-entrancy test suite and use a standard guard pattern around functions that perform external calls.

## Sepolia Status

Sepolia deployment is configured through `.env.sepolia`; local demo configuration is kept in `.env.local`.

Current deployment artifacts present:

- `deployments/localhost.json`
- `deployments/sepolia.json`

Current Sepolia deployment:

| Contract / Account | Address |
| --- | --- |
| Deployer / Admin / Oracle / Loan Officer | `0xDc5DE2Dbc61179b5cA9Dec58E6f9396D406123B1` |
| PropertyVerification | `0x71aee2f627a2f6e9dCf98BFF05fb93d585a6cAC0` |
| LtvGroth16Verifier | `0x91f3Eada3Ff8C0C650d1AD3ae3474A223fC83b3c` |
| ComplianceVerifier | `0x6b7Bb127664f447b22DacD3CA55c0441a2eE9F6F` |
| Lending | `0xbb536E247e0f87118ab2f3F81e35C768087e3072` |
