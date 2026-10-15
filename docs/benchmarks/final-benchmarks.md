# Final Benchmarks

This document records ProofEstate's local latency, gas, scenario, and repeated-run stability results. The complete functional evaluation is documented in the [evaluation notes](../evaluation-notes.md#functional-evaluation). Measurement dates, workloads, and runtime versions are retained with their results.

## Evidence Status

| Evidence type | Status |
| --- | --- |
| Functional evaluation | 37 contract/circuit, 12 Oracle API, and 6 frontend component tests passing; see evaluation notes |
| Node 20 gas snapshot | Dated workload and call counts in [evaluation notes](../evaluation-notes.md#gas-snapshot) |
| Primary compliant 30-run benchmark | Collected on 2026-09-25 |
| Correctness matrix benchmarks | Collected on 2026-09-25 |
| Bounded 10/30/50 repeated-run stability benchmarks | Collected on 2026-09-25 |
| Sepolia benchmark | Out of final benchmark scope |

Raw benchmark files:

| Role | Raw file |
| --- | --- |
| Primary compliant path, 30 measured runs | `docs/benchmarks/raw/local-2026-09-25T08-40-22-730Z.json` |
| Boundary path, 30 measured runs | `docs/benchmarks/raw/local-2026-09-25T08-38-18-654Z.json` |
| Non-compliant path, 30 measured runs | `docs/benchmarks/raw/local-2026-09-25T08-38-46-670Z.json` |
| Invalid-registry path, 30 measured runs | `docs/benchmarks/raw/local-2026-09-25T08-40-41-666Z.json` |
| Stability path, 10 measured runs | `docs/benchmarks/raw/local-2026-09-25T08-33-01-512Z.json` |
| Stability path, 50 measured runs | `docs/benchmarks/raw/local-2026-09-25T08-33-59-578Z.json` |

The raw files are schema-version-2 benchmark runs. They include per-sample `ok` values, top-level failure lists, summary statistics, and git metadata. Their metadata records `dirty: true`, including manuscript and documentation paths. It identifies the base commit and recorded changes, without preserving an immutable snapshot of the complete measured checkout. The primary 30-run file also supplies the 30-run stability row; there are six raw files.

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
| Git commit | `5f512070cbfc8c0b40d50d2be50d6595b17f29a7` |
| Generated at | 2026-09-25 |
| Network label | `localhost` |

## Benchmark Protocol

The command reproducing the recorded primary workload is:

```bash
pnpm benchmark:local --warmups=5 --runs=30 --property=PROP-001 --principal=750000 --api=http://127.0.0.1:8787
```

Commands reproducing the recorded scenario workloads are:

```bash
pnpm benchmark:local --warmups=5 --runs=30 --property=PROP-001 --principal=784000 --api=http://127.0.0.1:8787
pnpm benchmark:local --warmups=5 --runs=30 --property=PROP-001 --principal=784001 --api=http://127.0.0.1:8787
pnpm benchmark:local --warmups=5 --runs=30 --property=PROP-004 --principal=100000 --api=http://127.0.0.1:8787
```

Commands reproducing the recorded stability workloads are:

```bash
pnpm benchmark:local --warmups=5 --runs=10 --property=PROP-001 --principal=750000 --api=http://127.0.0.1:8787
pnpm benchmark:local --warmups=5 --runs=30 --property=PROP-001 --principal=750000 --api=http://127.0.0.1:8787
pnpm benchmark:local --warmups=5 --runs=50 --property=PROP-001 --principal=750000 --api=http://127.0.0.1:8787
```

All tables report measured runs only; warm-up iterations are excluded. Stages are timed sequentially. API requests use `write: false` and exclude chain submission and confirmation. Direct proving and API compliance use different proof invocations, so their median difference does not measure API overhead. Quantiles use nearest rank (`ceil(p*n)`); the reported median for even `n` is the lower central observation. Standard deviation uses denominator `n`.

## Workload

`PROP-001` has a mock registry valuation of `980000`, so the maximum compliant principal under the 80% LTV rule is:

```text
980000 * 8000 / 10000 = 784000
```

The primary principal `750000` is compliant. The boundary principal `784000` is exactly at the policy limit and should pass. The principal `784001` is one unit above the limit and should fail without proof generation. `PROP-004` fails registry verification because it is encumbered and should also fail without proof generation.

## Correctness Matrix

| Case | Property | Principal | Expected result | Observed result | Proof generation |
| --- | --- | ---: | --- | --- | --- |
| Compliant | `PROP-001` | 750000 | Pass | Pass, 0 failures across 30 measured runs | Generated |
| Boundary | `PROP-001` | 784000 | Pass at exactly 80% LTV | Pass, 0 failures across 30 measured runs | Generated |
| Non-compliant | `PROP-001` | 784001 | Reject above 80% LTV | Reject, 0 failures across 30 measured runs | Skipped, `NON_COMPLIANT_OR_MISSING_PROOF_INPUTS` |
| Invalid registry | `PROP-004` | 100000 | Reject failed registry verification | Reject, 0 failures across 30 measured runs | Skipped, `NO_ENCUMBRANCE` |

“Failures” counts caught exceptions or non-success HTTP responses; expected policy rejection does not count as a timing failure. The harness records proof generation and skip reasons but does not independently assert every API decision or verify each generated proof on chain. Registry rejection is an oracle rule, not an LTV circuit predicate. Contract/API tests provide separate behavioral evidence.

## Primary Local Latency Results

Primary compliant path: `PROP-001`, principal `750000`, 5 warm-up runs and 30 measured runs.

| Metric | Runs | Failures | Min ms | Median ms | Mean ms | P95 ms | Max ms | Std dev |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Build verification input | 30 | 0 | 1.91 | 3.05 | 3.22 | 4.77 | 7.94 | 1.09 |
| Build compliance inputs | 30 | 0 | 3.19 | 3.73 | 4.01 | 5.31 | 6.72 | 0.79 |
| Generate Groth16 proof | 30 | 0 | 372.42 | 399.53 | 407.55 | 469.53 | 481.21 | 24.66 |
| Oracle `/verify` latency | 30 | 0 | 5.02 | 5.98 | 6.78 | 11.45 | 12.54 | 1.91 |
| Oracle `/compliance` latency | 30 | 0 | 377.61 | 409.16 | 413.27 | 480.30 | 487.67 | 22.65 |

Median direct proving is 399.53 ms and median read-only `/compliance` response time is 409.16 ms. Their similar scale is consistent with proving dominating the successful path. API overhead was not separately measured because these are independent proof invocations.

## Boundary and Failure-Case Latency Results

| Case | Metric | Runs | Failures | Median ms | Mean ms | Notes |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| Boundary | Generate Groth16 proof | 30 | 0 | 437.08 | 471.37 | Proof generated at exactly 80% LTV |
| Boundary | Oracle `/compliance` latency | 30 | 0 | 432.62 | 451.57 | Includes proof generation |
| Non-compliant | Build compliance inputs | 30 | 0 | 3.24 | 3.37 | Rejects above 80% LTV |
| Non-compliant | Oracle `/compliance` latency | 30 | 0 | 5.38 | 5.54 | Proof generation skipped |
| Invalid registry | Build compliance inputs | 30 | 0 | 0.19 | 0.19 | Fails registry validation |
| Invalid registry | Oracle `/compliance` latency | 30 | 0 | 1.56 | 1.66 | Proof generation skipped |

Rejected paths are faster because the oracle does not invoke Groth16 proof generation when the LTV predicate or registry validation fails.

## Bounded Repeated-Run Stability

All stability runs use `PROP-001` with principal `750000` and the same local Oracle API. This is a repeated local workload, not a public-chain throughput or concurrent-user benchmark.

| Measured runs | Failures | Median proof ms | Mean proof ms | P95 proof ms | Median `/compliance` ms | P95 `/compliance` ms |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 10 | 0 | 441.43 | 455.58 | n/a | 428.45 | n/a |
| 30 | 0 | 399.53 | 407.55 | 469.53 | 409.16 | 480.30 |
| 50 | 0 | 406.01 | 413.36 | 440.06 | 408.36 | 475.02 |

The 10/30/50-run results show zero failures and similar median proof-generation latency. The evaluation is intentionally bounded to repeated local proof-generation workloads; it does not claim production scalability, public-chain throughput, or concurrent-traffic capacity.

## Gas Snapshot

Gas results use the dissertation Node 20 gas baseline recorded in `docs/evaluation-notes.md`.

The 310,411-gas compliance operation includes signal checks, generated verification, storage writes, and events. Method averages aggregate the recorded test-workload calls and storage states; the approval method can include both approval and rejection paths. A gas report from the current functional suite can have different aggregate averages because its call counts and path mix differ.

| Contract | Method | Avg gas |
| --- | --- | ---: |
| PropertyVerification | `setVerified` | 115996 |
| ComplianceVerifier | `verifyProofAndSetCompliance` | 310411 |
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

Final benchmark checkout production build snapshot from `docs/evaluation-notes.md`:

| Asset | Size | Gzip |
| --- | ---: | ---: |
| `dist/index.html` | 0.40 kB | 0.27 kB |
| `dist/assets/index-BFtmxQu3.css` | 64.46 kB | 12.05 kB |
| `dist/assets/ccip-DAv_GoVX.js` | 3.04 kB | 1.39 kB |
| `dist/assets/index-B72wscIt.js` | 636.26 kB | 189.62 kB |

## Local E2E Demo Duration

Final benchmark checkout local CLI flow from `docs/evaluation-notes.md`:

| Scenario | Command | Duration | Final state |
| --- | --- | ---: | --- |
| Happy path | `pnpm demo:flow PROP-001 750000` | 1.82s | `Repaid` |

This single observed duration includes Oracle service verification, compliance proof generation, on-chain verification, loan request, approval, and repayment on the local Hardhat chain. The CLI calls service functions directly. It does not measure HTTP round trips, browser wallet interaction, or public-chain confirmation latency, and is not a repeated-run end-to-end latency estimate.

## Reporting Rules

- These results are local results, not Sepolia results.
- Testnet latency should not be mixed into local performance tables.
- Warm-up runs are excluded from all summary statistics.
- Median is p50.
- Raw data is preserved for reproducibility.
- The benchmark metadata records base git commit `5f512070cbfc8c0b40d50d2be50d6595b17f29a7` with `dirty: true`; it does not identify an immutable complete checkout.
- The bounded scalability table reports repeated local proof-generation stability, not concurrent production throughput.
