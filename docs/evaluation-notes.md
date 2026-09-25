# ProofEstate Evaluation Notes

Updated: 2026-09-25 17:45 +08

## Environment

This evidence file aggregates the Node 20 functional, gas, benchmark, and security-evaluation evidence used by the thesis and manuscript.

| Item | Value |
| --- | --- |
| OS | macOS 14.1.1 (Build 23B81), Darwin 23.1.0 |
| CPU | Intel(R) Core(TM) i7-9750H CPU @ 2.60GHz |
| Node | v20.20.2 |
| pnpm | 10.9.0 |
| Hardhat | 2.28.6 |
| snarkjs | 0.7.6 |
| circom CLI | 2.2.3 at `$HOME/.cargo/bin/circom`; not on default PATH |
| Baseline test/gas commit | `4f2acc59d660c7d3666b9f55861b58f13995431c` |
| Final benchmark raw commit | `5f512070cbfc8c0b40d50d2be50d6595b17f29a7` |

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

Latest functional revalidation run on 2026-09-25 under Node v20.20.2:

```bash
pnpm test:all
```

Latest revalidation results:

- `pnpm test:all`: passing.
- Contract tests: 28 passing.
- Oracle API tests: 12 passing.
- Frontend tests: 6 passing.
- Frontend production build: passing.
- The first sandboxed Oracle API test attempt failed with local `127.0.0.1` listen `EPERM`; the same command passed when rerun with local port access.


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

Final benchmark checkout production build output:

| Asset | Size | Gzip |
| --- | ---: | ---: |
| `dist/index.html` | 0.40 kB | 0.27 kB |
| `dist/assets/index-BFtmxQu3.css` | 64.46 kB | 12.05 kB |
| `dist/assets/ccip-DAv_GoVX.js` | 3.04 kB | 1.39 kB |
| `dist/assets/index-B72wscIt.js` | 636.26 kB | 189.62 kB |

`du -sh frontend/dist` reports `2.5M`.

## Benchmark Snapshot

The current formal local benchmark summary is recorded in:

```text
docs/benchmarks/final-benchmarks.md
```

The current benchmark set includes a 30-run compliant path, boundary and failure-case runs, and 10/30/50 repeated-run stability snapshots. Raw JSON files are preserved in `docs/benchmarks/raw/`.

## Experiment Matrix Revalidation

Additional local benchmark runs were collected on 2026-09-25 under Node v20.20.2 to cover correctness boundary and failure cases in addition to the original compliant path. The Oracle API was run locally on `http://127.0.0.1:8787`. Local port access required running the Oracle API and benchmark commands outside the filesystem sandbox.

Raw files:

| Case | Property | Principal | Runs | Raw file | Result |
| --- | --- | ---: | ---: | --- | --- |
| Compliant | `PROP-001` | 750000 | 30 | `docs/benchmarks/raw/local-2026-09-25T08-40-22-730Z.json` | Pass, 0 failures, proof generated |
| Boundary | `PROP-001` | 784000 | 30 | `docs/benchmarks/raw/local-2026-09-25T08-38-18-654Z.json` | Pass, 0 failures, proof generated |
| Non-compliant | `PROP-001` | 784001 | 30 | `docs/benchmarks/raw/local-2026-09-25T08-38-46-670Z.json` | Reject, 0 failures, proof skipped |
| Invalid registry | `PROP-004` | 100000 | 30 | `docs/benchmarks/raw/local-2026-09-25T08-40-41-666Z.json` | Reject with `NO_ENCUMBRANCE`, proof skipped |
| Stability 10-run | `PROP-001` | 750000 | 10 | `docs/benchmarks/raw/local-2026-09-25T08-33-01-512Z.json` | Pass, 0 failures |
| Stability 50-run | `PROP-001` | 750000 | 50 | `docs/benchmarks/raw/local-2026-09-25T08-33-59-578Z.json` | Pass, 0 failures |

Primary compliant-path latency from the 30-run revalidation:

| Metric | Median ms | Mean ms | P95 ms |
| --- | ---: | ---: | ---: |
| Generate Groth16 proof | 399.53 | 407.55 | 469.53 |
| Oracle `/verify` latency | 5.98 | 6.78 | 11.45 |
| Oracle `/compliance` latency | 409.16 | 413.27 | 480.30 |

Bounded stability results for repeated compliant proof generation:

| Measured runs | Failures | Median proof ms | P95 proof ms |
| ---: | ---: | ---: | ---: |
| 10 | 0 | 441.43 | n/a |
| 30 | 0 | 399.53 | 469.53 |
| 50 | 0 | 406.01 | 440.06 |

These runs characterize local repeated proof-generation stability and selected correctness/failure cases. They do not claim public-chain throughput or concurrent production scalability. The raw files record git commit `5f512070cbfc8c0b40d50d2be50d6595b17f29a7` with `dirty: true` because manuscript and documentation updates were in progress.

## Sensitive and Runtime File Check

The following local runtime files are ignored by `.gitignore` and are not tracked by git:

- `.env.local`
- `.env.sepolia`
- `frontend/.env.local`
- `frontend/.env.sepolia`
- `frontend/dist/`
- `artifacts/`
- `cache/`

The checked-in deployment manifests `deployments/localhost.json` and `deployments/sepolia.json` contain public addresses used by the frontend build. They are not secret-bearing runtime files and should be updated only after inspection.

## Re-entrancy Assessment

Re-entrancy is not an active risk in the current MVP because `Lending` does not transfer ETH, transfer ERC20 tokens, or call borrower-controlled contracts. Repayment is modeled as a state transition only, and the loan state is updated without external calls.

If the MVP later adds real asset disbursement, repayment transfers, ERC20 collateral, or liquidation callbacks, then `Lending` should add a dedicated re-entrancy test suite and use a standard guard pattern around functions that perform external calls.

## Sepolia Status

Sepolia deployment is configured through `.env.sepolia`; local demo configuration is kept in `.env.local`.

Sepolia evidence is optional public validation for this project. It should not be mixed into local performance tables unless clearly labeled as testnet data.
