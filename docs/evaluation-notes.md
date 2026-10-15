# ProofEstate Evaluation Notes

Updated: 2026-10-15. Measurement records retain their collection dates and environments.

## Environment

The evaluation covers functional correctness, security boundaries, circuit arithmetic, local latency, and gas consumption. Functional results describe the complete current test suite. Performance results retain the environment and workload in which they were measured.

## Functional Evaluation

The complete functional suite passed on 2026-10-15 under Node **v22.22.1**:

| Command | Coverage | Result |
| --- | --- | --- |
| `pnpm test` | Registry logic, deployment/roles, contract lifecycle, proof binding, security boundaries, and circuit arithmetic | 37 passing |
| `pnpm test:oracle` | Oracle API input validation and selected rejection paths | 12 passing |
| `pnpm frontend:test` | Frontend components in Vitest/jsdom | 6 passing |

Security and arithmetic cases form part of the same 37-test contract/circuit suite in [test/proofestate.test.js](../test/proofestate.test.js). Selected boundary cases are summarized below; the table is not a separate test suite.

| Scenario | Observed result |
| --- | --- |
| Valid proof offered for another verified property | Rejected at public signal 0 |
| Threshold signal changed from 8000 to 9000 | Rejected at public signal 3 |
| Refresh retains the valuation commitment | Compliance clears; the identical proof can restore it |
| Owner changes after request, with valuation commitment retained | Original borrower's pending request can still be approved |
| Another principal's proof replaces current compliance | On a subsequent approval attempt, the pending request for the old commitment is rejected and its lock released |
| Verification refresh after approval | Approved loan and active lock remain |
| Exact 80% boundary and one unit above | Boundary proof accepted on chain; over-limit witness fails a circuit constraint |
| Largest 64-bit valuation | Maximum compliant principal proves and verifies; its next integer fails |
| Valuation and principal at `2^64` | Both overflow witnesses fail despite valid commitments and a satisfied inequality |

The accepted workflow observations delimit freshness, ownership continuity, the shared compliance slot, and approval as a snapshot. The owner-change test deliberately uses the authorized Oracle to preserve the valuation commitment while changing the owner. Frontend component tests do not constitute full browser or wallet-transaction coverage.

The arithmetic tests call the prover directly with consistently computed commitments, independently of API validation. To isolate the principal range constraint, that overflow case uses a policy input of 10001, which satisfies the raw circuit's 14-bit policy range and the inequality; the application wrapper still requires 8000. Expected failures must contain a witness assertion failure, so missing proving artifacts do not count as policy rejections.

`pnpm thesis:check` runs `scripts/thesis/audit.mjs` to check titles, abstract/keyword limits, local figure references, caption/reference numbering, and raw timing summaries. It is read-only and writes no evidence manifest. Original raw observations and the provenance recorded below remain the evidence sources.

For the archived timing files, API requests use `write: false`; direct and API proving are separate invocations. Quantiles use nearest rank, population standard deviation uses denominator `n`, and “failures” means caught exceptions or failed HTTP status. Each timing sample is not an independent correctness assertion or on-chain proof verification.

## Measurement Environment

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

## Measurement Provenance

The following dated records describe the checkout used for the gas, build, and workflow measurements. The functional evaluation above is the current test result; earlier suite counts remain here as measurement provenance.

<details>
<summary>Validation records for the measurement checkout (July–September 2026)</summary>

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

Measurement-checkout validation run on 2026-09-25 under Node v20.20.2:

```bash
pnpm test:all
```

Measurement-checkout validation results:

- `pnpm test:all`: passing.
- Contract tests: 28 passing.
- Oracle API tests: 12 passing.
- Frontend tests: 6 passing.
- Frontend production build: passing.
- The first sandboxed Oracle API test attempt failed with local `127.0.0.1` listen `EPERM`; the same command passed when rerun with local port access.


Notes:

- Oracle API tests and gas reporter require local port access; they were run outside the filesystem sandbox after sandboxed runs failed with local networking `EPERM`.
- The frontend build emits a Vite chunk-size warning for the main JS bundle; it does not fail the build.
- The recorded `circom` CLI was installed at `$HOME/.cargo/bin/circom`, which is the path used by `scripts/zk-build.mjs` when present. A shell that omits this directory from PATH needs the full path or `CIRCOM_BIN` for a circuit rebuild.

</details>

## Gas Snapshot

Generated with:

```bash
pnpm test:gas
```

These averages describe the dated Node 20 test workload, including its call counts and storage states. Running the current suite can produce different aggregate averages because the path mix differs. `verifyProofAndSetCompliance` measures the complete transaction, including binding checks, generated proof verification, state writes, and events. `approveLoan` includes successful and automatic-rejection paths.

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

Deployment addresses recorded for the local measurement run:

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

This is one observed CLI run on Hardhat, including local transaction waits. The CLI calls Oracle service functions directly; it does not measure the HTTP API, browser wallet interaction, or public-chain confirmation latency. The readiness check covers RPC, API liveness, bytecode at four core contract addresses, and frontend environment keys; it does not exercise proof generation or role permissions.

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

The local benchmark matrix was collected on 2026-09-25 under Node v20.20.2. It covers the compliant path, exact boundary, above-limit rejection, invalid-registry rejection, and repeated-run stability. The Oracle API was run locally on `http://127.0.0.1:8787`. Local port access required running the Oracle API and benchmark commands outside the filesystem sandbox.

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

These runs characterize local repeated proof-generation stability and selected rejection paths. The primary 30-run file also supplies the 30-run stability row: the matrix contains six raw files, rather than seven independent experiments. They do not measure public-chain throughput or concurrent production scalability. The raw files record git commit `5f512070cbfc8c0b40d50d2be50d6595b17f29a7` with `dirty: true`; their metadata identifies the base commit and recorded changes, without providing an immutable snapshot of the complete measured checkout.

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

`Lending` performs no ETH/ERC20 transfers or borrower-controlled callbacks. Repayment is a state transition without an external call. Request and approval do make read-only external calls to the immutable `PropertyVerification` dependency. The current execution path therefore lacks an asset-transfer callback, but should not be described as having no external calls or as a general proof of re-entrancy safety.

If the MVP later adds real asset disbursement, repayment transfers, ERC20 collateral, or liquidation callbacks, then `Lending` should add a dedicated re-entrancy test suite and use a standard guard pattern around functions that perform external calls.

## Sepolia Status

Sepolia deployment is configured through `.env.sepolia`; local demo configuration is kept in `.env.local`.

Sepolia evidence is optional public validation for this project. It should not be mixed into local performance tables unless clearly labeled as testnet data.
