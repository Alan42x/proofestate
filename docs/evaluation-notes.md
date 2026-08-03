# ProofEstate Evaluation Notes

Updated: 2026-08-03 22:49 +08

## Environment

This evidence snapshot was revalidated under the project-supported Node 20 runtime.

| Item | Value |
| --- | --- |
| OS | macOS 14.1.1 (Build 23B81), Darwin 23.1.0 |
| CPU | Intel(R) Core(TM) i7-9750H CPU @ 2.60GHz |
| Node | v20.20.2 |
| pnpm | 10.9.0 |
| Hardhat | 2.28.6 |
| snarkjs | 0.7.6 |
| circom CLI | 2.2.3 at `$HOME/.cargo/bin/circom`; not on default PATH |
| Git commit | `4f2acc59d660c7d3666b9f55861b58f13995431c` |

`snarkjs r1cs info zk/build/ltv.r1cs` reports:

- Curve: bn-128.
- Wires: 4198.
- Constraints: 4196.
- Private inputs: 4.
- Public inputs: 4.
- Outputs: 0.

## Verification Status

Baseline commands run on 2026-07-30:

```bash
pnpm compile
pnpm test:all
pnpm test:gas
pnpm zk:compile
pnpm demo:deploy
pnpm demo:ready
pnpm demo:flow PROP-001 750000
```

Results:

- `pnpm compile`: passing, nothing to compile.
- Contract tests: 28 passing.
- Oracle API tests: 12 passing.
- Frontend tests: 6 passing.
- Frontend production build: passing.
- `pnpm test:gas`: passing.
- `pnpm zk:compile`: passing, with `circom compiler 2.2.3`; regenerated `zk/build/ltv.r1cs`, `zk/build/ltv.sym`, and `zk/build/ltv_js/ltv.wasm`.
- `pnpm demo:ready`: passing for local RPC, Oracle API, deployment, and frontend env.
- `pnpm demo:flow PROP-001 750000`: passing, final loan state `Repaid`.

Revalidation commands run on 2026-08-03 under Node v20.20.2:

```bash
pnpm test:all
pnpm test:gas
```

Revalidation results:

- `pnpm test:all`: passing.
- Contract tests: 28 passing.
- Oracle API tests: 12 passing.
- Frontend tests: 6 passing.
- Frontend production build: passing.
- `pnpm test:gas`: passing.
- README local Markdown links/images: passing.
- README `pnpm` script references: passing.

Notes:

- Oracle API tests and gas reporter require local port access; they were run outside the filesystem sandbox after sandboxed runs failed with local networking `EPERM`.
- The frontend build emits a Vite chunk-size warning for the main JS bundle; it does not fail the build.
- The current `circom` CLI is installed at `$HOME/.cargo/bin/circom`, which is the path used by `scripts/zk-build.mjs` when present. It is not on the default shell PATH, so a bare `circom --version` fails unless that directory is added to PATH or `CIRCOM_BIN` is set.

## Gas Snapshot

Generated with:

```bash
REPORT_GAS=true hardhat test
```

| Contract | Method | Min gas | Max gas | Avg gas | Calls |
| --- | ---: | ---: | ---: | ---: | ---: |
| ComplianceVerifier | verifyProofAndSetCompliance | 310409 | 310421 | 310411 | 11 |
| Lending | approveLoan | 58252 | 93881 | 81464 | 12 |
| Lending | cancelLoan | - | - | 52694 | 2 |
| Lending | grantRole | 51152 | 51524 | 51245 | 4 |
| Lending | rejectLoan | - | - | 52620 | 2 |
| Lending | repay | - | - | 57219 | 5 |
| Lending | requestLoan | 224733 | 241833 | 233609 | 18 |
| PropertyVerification | grantRole | 51086 | 51470 | 51214 | 6 |
| PropertyVerification | setVerified | 46738 | 121950 | 115996 | 16 |
| RoleAdminManager | grantProtocolAdmin | - | - | 120499 | 3 |
| RoleAdminManager | revokeProtocolAdmin | 54032 | 55632 | 55099 | 3 |

Deployment gas:

| Contract | Avg gas | Block limit share |
| --- | ---: | ---: |
| ComplianceVerifier | 417315 | 0.7% |
| Lending | 1152092 | 1.9% |
| LtvGroth16Verifier | 411178 | 0.7% |
| PropertyVerification | 771511 | 1.3% |
| RoleAdminManager | 719736 | 1.2% |

## Local Demo Evidence

Fresh local deployment:

| Contract / Account | Address |
| --- | --- |
| Deployer / Admin | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` |
| Oracle | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` |
| Loan Officer | `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` |
| PropertyVerification | `0x5FbDB2315678afecb367f032d93F642f64180aa3` |
| LtvGroth16Verifier | `0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512` |
| ComplianceVerifier | `0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0` |
| Lending | `0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9` |
| RoleAdminManager | `0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9` |

`pnpm demo:flow PROP-001 750000` completed the workflow:

- Oracle verification and compliance completed in 1.46s.
- Verification transaction: `0x17005261fce4e0338ea7246c46dd8140a1a28586eaa880c1550e1eefd269c1dc`.
- Compliance transaction: `0xa394cf923198a7436228cf9ddf544c025672804b0a66e7b6f3e2bbb1c4ad8bac`.
- Loan ID: `3`.
- Borrower: `0x90F79bf6EB2c4f870365E785982E1f101E93b906`.
- Final state: `2` / `Repaid`.
- Flow duration: 1.82s.

## Frontend Build Size

Latest production build output:

| Asset | Size | Gzip |
| --- | ---: | ---: |
| `dist/index.html` | 0.40 kB | 0.26 kB |
| `dist/assets/index-BFtmxQu3.css` | 64.46 kB | 12.05 kB |
| `dist/assets/ccip-B5I7aiLd.js` | 3.04 kB | 1.39 kB |
| `dist/assets/index-DrKouoma.js` | 631.18 kB | 189.69 kB |

`du -sh frontend/dist` reports `2.5M`.

## Benchmark Snapshot

The current formal local benchmark is recorded in:

```text
docs/benchmarks/final-benchmarks.md
docs/benchmarks/raw/local-2026-08-03T14-49-27-759Z.json
```

It uses 5 warm-up iterations and 30 measured iterations for `PROP-001` with principal `750000`.

## Sensitive and Runtime File Check

The following are ignored by `.gitignore` and are not tracked by git:

- `.env.local`
- `.env.sepolia`
- `frontend/.env.local`
- `frontend/.env.sepolia`
- `deployments/*.json`
- `frontend/dist/`
- `artifacts/`
- `cache/`

The localhost and Sepolia deployment JSON files exist locally but are treated as ignored runtime state, not public source-of-truth documentation.

## Re-entrancy Assessment

Re-entrancy is not an active risk in the current MVP because `Lending` does not transfer ETH, transfer ERC20 tokens, or call borrower-controlled contracts. Repayment is modeled as a state transition only, and the loan state is updated without external calls.

If the MVP later adds real asset disbursement, repayment transfers, ERC20 collateral, or liquidation callbacks, then `Lending` should add a dedicated re-entrancy test suite and use a standard guard pattern around functions that perform external calls.

## Sepolia Status

Sepolia deployment is configured through `.env.sepolia`; local demo configuration is kept in `.env.local`.

Sepolia evidence is optional public validation for this project. It should not be mixed into local performance tables unless clearly labeled as testnet data.
