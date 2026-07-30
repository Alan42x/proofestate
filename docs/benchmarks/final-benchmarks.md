# Final Benchmarks

This document records the current dissertation-ready local benchmark snapshot for ProofEstate.

## Evidence Status

| Evidence type | Status |
| --- | --- |
| Node 20 test/gas snapshot | Available in `docs/evaluation-notes.md` |
| Local 30-run benchmark | Collected on 2026-07-30 |
| Raw benchmark file | `docs/benchmarks/raw/local-2026-07-30T07-37-28-929Z.json` |
| Sepolia benchmark | Optional and not collected |

The file listed above is the current final local benchmark run.

The current raw file is a schema-version-2 run. It includes raw per-sample `ok` values, summary failure counts, a top-level `failures` list, and git dirty worktree metadata. This benchmark was collected before the final documentation/script commit, so `dirty` is expected to be `true`; regenerate the benchmark after the final commit for release-grade clean git metadata.

## Environment

| Item | Value |
| --- | --- |
| OS | Darwin 23.1.0 x64 |
| CPU | Intel(R) Core(TM) i7-9750H CPU @ 2.60GHz |
| Node | v20.20.2 |
| pnpm | 10.9.0 |
| Hardhat | 2.28.6 |
| snarkjs | 0.7.6 |
| circom | 2.2.3 at `$HOME/.cargo/bin/circom` |
| Git commit | `afe725b8635ce1e6b2068a419a214ca4cdea648e` |
| Generated at | 2026-07-30 15:37 +08 |
| Network label | `localhost` |

## Benchmark Protocol

Command:

```bash
pnpm benchmark:local --warmups=5 --runs=30 --property=PROP-001 --principal=750000 --api=http://127.0.0.1:8787
```

Configuration:

| Parameter | Value |
| --- | --- |
| Warm-up runs | 5 |
| Measured runs | 30 |
| Property | `PROP-001` |
| Principal | `750000` |
| Oracle API | `http://127.0.0.1:8787` |
| Result type | Local latency, not Sepolia latency |

The first five iterations were excluded from the summary statistics. All summary rows below use only the 30 measured iterations.

## Workload

`PROP-001` has a mock registry valuation of `980000`, so the maximum compliant principal under the 80% LTV rule is:

```text
980000 * 8000 / 10000 = 784000
```

The benchmark principal `750000` is therefore compliant. This run measures the successful proof-generation path.

## Local Latency Results

| Metric | Runs | Failures | Min ms | Median ms | Mean ms | P95 ms | Max ms | Std dev |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Build verification input | 30 | 0 | 1.92 | 2.75 | 3.16 | 6.45 | 7.11 | 1.13 |
| Build compliance inputs | 30 | 0 | 2.86 | 3.82 | 3.90 | 5.41 | 5.46 | 0.71 |
| Generate Groth16 proof | 30 | 0 | 368.64 | 383.80 | 385.63 | 407.33 | 417.73 | 10.87 |
| Oracle `/verify` latency | 30 | 0 | 4.92 | 6.06 | 6.35 | 10.12 | 10.43 | 1.20 |
| Oracle `/compliance` latency | 30 | 0 | 373.97 | 389.39 | 392.52 | 429.94 | 437.81 | 16.27 |

Interpretation:

- Proof generation dominates local latency.
- Oracle `/verify` is fast because it only evaluates registry rules and computes commitments.
- Oracle `/compliance` is close to proof generation time because it includes proof generation inside the API request.

## Gas Snapshot

Gas results are from the latest Node 20 `pnpm test:gas` run recorded in `docs/evaluation-notes.md`.

| Contract | Method | Avg gas |
| --- | --- | ---: |
| PropertyVerification | `setVerified` | 115996 |
| ComplianceVerifier | `verifyProofAndSetCompliance` | 310413 |
| Lending | `requestLoan` | 233609 |
| Lending | `approveLoan` | 81464 |
| Lending | `cancelLoan` | 52694 |
| Lending | `rejectLoan` | 52620 |
| Lending | `repay` | 57219 |
| RoleAdminManager | `grantProtocolAdmin` | 120499 |
| RoleAdminManager | `revokeProtocolAdmin` | 55099 |

Deployment gas:

| Contract | Avg gas |
| --- | ---: |
| PropertyVerification | 771511 |
| ComplianceVerifier | 417315 |
| LtvGroth16Verifier | 411178 |
| Lending | 1152092 |
| RoleAdminManager | 719736 |

## Circuit Size

`snarkjs r1cs info zk/build/ltv.r1cs` reports:

| Metric | Value |
| --- | ---: |
| Curve | bn-128 |
| Wires | 4198 |
| Constraints | 4196 |
| Private inputs | 4 |
| Public inputs | 4 |
| Public outputs | 0 |

## Frontend Bundle

Latest production build snapshot from `docs/evaluation-notes.md`:

| Asset | Size | Gzip |
| --- | ---: | ---: |
| `dist/index.html` | 0.40 kB | 0.27 kB |
| `dist/assets/index-BFtmxQu3.css` | 64.46 kB | 12.05 kB |
| `dist/assets/ccip-FjsgKrcH.js` | 3.04 kB | 1.39 kB |
| `dist/assets/index-X42ujOvf.js` | 631.18 kB | 189.69 kB |

## Local E2E Demo Duration

Latest local CLI flow from `docs/evaluation-notes.md`:

| Scenario | Command | Duration | Final state |
| --- | --- | ---: | --- |
| Happy path | `pnpm demo:flow PROP-001 750000` | 1.82s | `Repaid` |

This duration includes Oracle verification, compliance proof generation, on-chain verification, loan request, approval, and repayment on the local Hardhat chain.

## Reporting Rules

- These results are local results, not Sepolia results.
- Testnet latency should not be mixed into this table.
- Earlier smoke benchmark files are not cited as final results.
- Median is p50; it is not reported as a separate metric.
- Raw data is preserved for reproducibility.
- New benchmark runs record git commit and dirty worktree status; final release evidence should be regenerated after committing documentation and script changes.

## Remaining Benchmark Gaps

The current final benchmark covers the compliant path for `PROP-001` and principal `750000`. Future benchmark extensions should add:

- exact-boundary case: `PROP-001`, `784000`;
- non-compliant case: `PROP-001`, `784001`;
- invalid registry case: `PROP-004`, `100000`;
- optional Sepolia transaction latency if RPC and funds are stable.
