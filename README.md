# ProofEstate

ProofEstate is an Ethereum prototype for privacy-preserving real-estate lending. It combines a mock property registry, an Oracle service, Groth16 zero-knowledge proof generation, role-gated Solidity contracts, and a React DApp.

The prototype demonstrates one core lending rule:

```text
loanPrincipal * 10000 <= propertyValue * 8000
```

This is equivalent to proving `loanPrincipal <= 80% of propertyValue` without publishing the plaintext property valuation or loan principal on-chain. The chain stores commitments, proof hashes, ownership, verification/compliance state, and loan lifecycle state.

ProofEstate is a dissertation prototype, not a production lending protocol. Real disbursement, KYC/AML, liquidation, production registry integration, monitoring, and decentralized Oracle governance are intentionally out of scope.

## Contents

- [What It Demonstrates](#what-it-demonstrates)
- [Current Evidence Snapshot](#current-evidence-snapshot)
- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [Local Demo](#local-demo)
- [Sepolia Validation](#sepolia-validation)
- [Frontend](#frontend)
- [Testing](#testing)
- [Benchmark Summary](#benchmark-summary)
- [Core Contracts](#core-contracts)
- [ZK Design](#zk-design)
- [Repository Structure](#repository-structure)
- [Environment Files](#environment-files)
- [Security Notes](#security-notes)
- [Documentation Index](#documentation-index)
- [Limitations](#limitations)
- [License](#license)

## What It Demonstrates

ProofEstate models a lending workflow with four operational roles:

| Role | Responsibility |
| --- | --- |
| Protocol admin | Manages privileged protocol roles |
| Oracle operator | Writes property verification and proof-related data to chain |
| Borrower | Requests a loan against a verified owned property |
| Loan officer | Approves or rejects loan requests |

The end-to-end workflow is:

```text
Property registry data
  -> Oracle verification write
  -> ZK LTV proof generation
  -> On-chain proof verification and compliance write
  -> Borrower loan request
  -> Loan officer approval
  -> Borrower repayment
```

The important boundary is that the browser never receives private Oracle credentials. In both local and Sepolia modes, the frontend calls the Oracle API, and the Oracle API signs privileged writes with its configured private key.

## Current Evidence Snapshot

Latest local functional and benchmark evidence was revalidated on 2026-09-25 with Node `v20.20.2`. The gas snapshot remains the Node 20 Hardhat gas-reporter baseline recorded in [docs/evaluation-notes.md](docs/evaluation-notes.md).

| Evidence | Status |
| --- | --- |
| Contract tests | 28 passing |
| Oracle API tests | 12 passing |
| Frontend tests | 6 passing |
| Frontend production build | Passing |
| Security and adversarial testing | Covered by contract, Oracle API, frontend, and benchmark-matrix evidence |
| Gas snapshot | Passing Node 20 baseline |
| ZK compile | Passing with circom `2.2.3` |
| Local readiness check | Passing |
| Local CLI happy path | Passing, final state `Repaid` |
| Formal local benchmark | 2026-09-25 matrix: 5 warm-up + 30 measured runs per correctness case, plus 10/30/50 stability runs |

See:

- [docs/evaluation-notes.md](docs/evaluation-notes.md)
- [docs/benchmarks/final-benchmarks.md](docs/benchmarks/final-benchmarks.md)

## Architecture

### System Architecture

![System architecture](docs/figures/01-system-architecture.png)

### Business Workflow

![Business workflow](docs/figures/02-business-workflow.png)

### Technical Architecture

![Technical architecture](docs/figures/03-technical-architecture.png)

### ZK Proof Workflow

![ZK proof workflow](docs/figures/04-zk-proof-workflow.png)

### End-to-End Data Flow

![End-to-end data flow](docs/figures/05-end-to-end-data-flow.png)

### Loan State Machine

![Loan state machine](docs/figures/06-loan-state-machine.png)

The Mermaid and PlantUML source files live in [docs/figures](docs/figures/).

## Quick Start

Use Node 20 from `.nvmrc`:

```bash
nvm use
pnpm install
```

Compile contracts:

```bash
pnpm compile
```

Optional ZK rebuild:

```bash
pnpm zk:build
```

The ZK build script auto-detects `$HOME/.cargo/bin/circom` when present. If needed, set:

```bash
export CIRCOM_BIN="$HOME/.cargo/bin/circom"
```

For a step-by-step local reproduction, continue with [Local Demo](#local-demo). For public testnet validation, see [Sepolia Validation](#sepolia-validation).

## Local Demo

The local demo is the canonical reproducible path for testing, benchmarking, and project evaluation. It runs a Hardhat chain, deploys contracts locally, starts the Oracle API, and executes the full loan lifecycle.

Terminal 1:

```bash
pnpm chain:local
```

Terminal 2:

```bash
pnpm demo:deploy
pnpm oracle:api
```

Terminal 3:

```bash
pnpm demo:ready
pnpm demo:flow PROP-001 750000
```

Expected final state:

```text
Repaid
```

Screenshot evidence for the browser workflow is indexed in [docs/screenshots/README.md](docs/screenshots/README.md).

## Sepolia Validation

Sepolia is optional public validation, not the primary evidence path. Use it to show that the same contracts and Oracle workflow run on a public Ethereum testnet. Do not mix Sepolia latency with local benchmark tables.

The detailed Sepolia, Vercel, and deployment instructions live in [docs/deployment-guide.md](docs/deployment-guide.md). Never commit private keys or RPC secrets.

### Deploy Or Inspect

Deploy or inspect the Sepolia contracts:

```bash
pnpm deploy:sepolia
pnpm sepolia:inspect
```

If contracts are already deployed, prefer `pnpm sepolia:inspect` before sending new transactions. It checks contract bytecode, roles, selected property state, and recent loan state.

### Sepolia Validation Flow

```text
1. Start Oracle API with pnpm oracle:api:sepolia
2. Start frontend with pnpm frontend:dev:sepolia
3. Connect borrower wallet on Sepolia
4. Select PROP-011
5. Run property verification
6. Generate compliance proof with principal 600000
7. Request loan as borrower
8. Switch to loan officer wallet
9. Approve loan
10. Optionally switch back to borrower and repay
```

Sepolia transactions consume Sepolia test ETH. The Oracle pays gas for verification and compliance writes; the borrower pays gas for loan requests and repayment; the loan officer pays gas for approval or rejection.

For the current public deployment table, hosted Oracle URL, Vercel settings, and troubleshooting rules, see [docs/deployment-guide.md](docs/deployment-guide.md).

## Frontend

Run the local DApp against the local Hardhat deployment:

```bash
pnpm frontend:dev:local
```

Run the local DApp against Sepolia:

```bash
pnpm frontend:dev:sepolia
```

Build commands:

```bash
pnpm frontend:build:local
pnpm frontend:build:sepolia
```

The local DApp expects:

- Hardhat RPC at `http://127.0.0.1:8545`;
- Oracle API at `http://localhost:8787`;
- deployment addresses in `frontend/.env.local`.

The Sepolia DApp expects:

- Sepolia RPC in `frontend/.env.sepolia`;
- Oracle API at `VITE_ORACLE_API_URL`;
- Sepolia contract addresses in `frontend/.env.sepolia`.

## Testing

Core commands:

```bash
pnpm compile
pnpm test
pnpm test:oracle
pnpm frontend:test
pnpm frontend:build
pnpm test:gas
pnpm test:all
```

The main contract suite covers:

- role configuration and revocation;
- registry rule evaluation;
- malformed input rejection;
- property verification writes;
- stale compliance clearing;
- Groth16 proof acceptance and tampering rejection;
- public signal mismatch rejection;
- proof replay boundaries;
- loan request, approval, rejection, cancellation, and repayment;
- duplicate active-loan locking;
- borrower-only and loan-officer-only actions.

## Benchmark Summary

Formal local benchmark command for the primary compliant path:

```bash
pnpm benchmark:local --warmups=5 --runs=30 --property=PROP-001 --principal=750000 --api=http://127.0.0.1:8787
```

Primary raw data:

```text
docs/benchmarks/raw/local-2026-09-25T08-40-22-730Z.json
```

The final benchmark set also includes 30-run boundary, non-compliant, and invalid-registry cases, plus 10/30/50 repeated-run stability snapshots. See [docs/benchmarks/final-benchmarks.md](docs/benchmarks/final-benchmarks.md) for the complete raw-data matrix.

Primary compliant-path summary:

| Metric | Median | Mean | P95 |
| --- | ---: | ---: | ---: |
| Build verification input | 3.05 ms | 3.22 ms | 4.77 ms |
| Build compliance inputs | 3.73 ms | 4.01 ms | 5.31 ms |
| Generate Groth16 proof | 399.53 ms | 407.55 ms | 469.53 ms |
| Oracle `/verify` latency | 5.98 ms | 6.78 ms | 11.45 ms |
| Oracle `/compliance` latency | 409.16 ms | 413.27 ms | 480.30 ms |

Correctness matrix summary:

| Case | Property | Principal | Result |
| --- | --- | ---: | --- |
| Compliant | `PROP-001` | 750000 | Pass, proof generated |
| Boundary | `PROP-001` | 784000 | Pass at exactly 80% LTV, proof generated |
| Non-compliant | `PROP-001` | 784001 | Reject, proof skipped |
| Invalid registry | `PROP-004` | 100000 | Reject, proof skipped |

Proof generation dominates local latency. See [docs/benchmarks/final-benchmarks.md](docs/benchmarks/final-benchmarks.md) for methodology, raw-data reference, gas snapshot, circuit size, and frontend bundle size.

## Core Contracts

| Contract | Purpose |
| --- | --- |
| `PropertyVerification` | Stores Oracle-written verification state and verifier-written compliance state |
| `ComplianceVerifier` | Binds public proof signals to on-chain property state and calls the generated Groth16 verifier |
| `LtvGroth16Verifier` | snarkjs-generated verifier for `circuits/ltv.circom` |
| `Lending` | Manages loan requests, approvals, rejections, cancellations, repayments, and active property locks |
| `RoleAdminManager` | Coordinates protocol admin grants and revocations |

Detailed interfaces are documented in [docs/smart-contract-interface-spec.md](docs/smart-contract-interface-spec.md).

## ZK Design

The public signals are:

- `propertyKeyField`;
- `valuationCommitment`;
- `principalCommitment`;
- `maxLtvBps`.

The private inputs are:

- `propertyValue`;
- `loanPrincipal`;
- `valuationSalt`;
- `principalSalt`.

The circuit uses `MiMCSponge(3, 220, 1)` with `k = 0`, 64-bit range checks for value inputs, a 14-bit range check for `maxLtvBps`, and an 80-bit product comparison.

Detailed proof design is documented in [docs/zk-proof-design.md](docs/zk-proof-design.md).

## Repository Structure

```text
contracts/
  PropertyVerification.sol
  ComplianceVerifier.sol
  Lending.sol
  RoleAdminManager.sol
  generated/LtvGroth16Verifier.sol

backend/oracle/
  properties.js
  service.js
  contracts.js
  server.js
  cli.js

circuits/
  ltv.circom

zk/
  ltvCircuit.js
  prover.js
  build/
  artifacts/

frontend/
  src/

scripts/
  chain/             # deployment, address synchronization, Sepolia inspection
  local/             # local readiness, wallet workflow, timing benchmarks
  e2e/               # browser smoke tests and layout checks
  thesis/            # manuscript checks, Word builds, and defense slide source
  load-env.js        # shared environment loader
  zk-build.mjs

test/
  proofestate.test.js

docs/
  figures/
  benchmarks/
  screenshots/

thesis/
  thesis.md
  jisa.md
  docx/

slides/
  assets/nus-logo.png
  proofestate-nus-defense-presentation.pptx
```

Run scripts through the `pnpm` commands documented above. `pnpm thesis:check` checks manuscript references, captions, abstract/keyword limits, and timing summaries without writing files; it verifies the referenced archives and also accepts new benchmark runs. `pnpm thesis:docx` rebuilds both Word manuscripts in `thesis/docx` and requires Pandoc and `python-docx`. If the current Python lacks `python-docx`, the builder uses the Codex-managed document runtime when available. The two Markdown manuscripts are the content sources; keep content changes there before rebuilding Word.

`pnpm thesis:slides` rebuilds the editable 15-slide defense deck from [scripts/thesis/build-slides.mjs](scripts/thesis/build-slides.mjs). The script contains slide content, layout, citations, evidence paths, and the complete read-aloud speaker Notes. Defense citations refer to the full [thesis](thesis/thesis.md) and its implementation or experimental evidence; the JISA manuscript is the separate journal version. The builder reuses the existing DApp screenshots and the NUS logo in `slides/assets`.

The slide builder requires the Codex-bundled `@oai/artifact-tool` presentation runtime (version 2.7.3 or newer), which is separate from the application dependencies and is not installed by `pnpm install`. It detects the managed runtime automatically; `ARTIFACT_TOOL_PATH` can specify the package directory elsewhere. For review, use `pnpm thesis:slides --out <file.pptx> --preview-dir <directory>` to export a copy and slide previews without replacing the final deck. Keep slide edits in the source before rebuilding; rebuilding replaces direct PowerPoint edits.

## Environment Files

Ignored runtime files:

```text
.env.local
.env.sepolia
frontend/.env.local
frontend/.env.sepolia
```

`deployments/localhost.json` and `deployments/sepolia.json` are public address manifests used by the frontend build. They should not contain private keys.

Generated build/runtime folders:

```text
artifacts/
cache/
frontend/dist/
zk/build/
zk/artifacts/
```

Do not commit private keys, RPC secrets, or ignored deployment state.

## Security Notes

- The Oracle is centralized and trusted in this prototype.
- The browser never needs private keys beyond the user's connected wallet.
- `ORACLE_PRIVATE_KEY` must remain server-side only.
- Hardhat default accounts are public and must not be funded on public networks.
- Sepolia is useful for public transaction evidence, but it is not a benchmark environment.
- RPC endpoints used in frontend env files are public to browser users.

For deeper analysis, see [docs/security-evaluation-report.md](docs/security-evaluation-report.md).

## Documentation Index

| Document | Purpose |
| --- | --- |
| [docs/evaluation-notes.md](docs/evaluation-notes.md) | Final functional, environment, and gas evidence |
| [docs/benchmarks/final-benchmarks.md](docs/benchmarks/final-benchmarks.md) | Formal local benchmark results |
| [docs/zk-proof-design.md](docs/zk-proof-design.md) | ZK statement, signals, circuit behavior, replay/freshness boundaries |
| [docs/smart-contract-interface-spec.md](docs/smart-contract-interface-spec.md) | Contract interface and revert/event specification |
| [docs/security-evaluation-report.md](docs/security-evaluation-report.md) | Threat model, mitigations, assumptions, residual risks |
| [docs/design-decisions.md](docs/design-decisions.md) | Architecture decisions, alternatives, and qualitative comparison |
| [docs/limitations-and-extensions.md](docs/limitations-and-extensions.md) | Prototype boundaries, future work, and candidate applications |
| [docs/deployment-guide.md](docs/deployment-guide.md) | Local and Sepolia reproduction guide |
| [docs/screenshots/README.md](docs/screenshots/README.md) | Local DApp screenshot evidence index |
| [thesis/thesis.md](thesis/thesis.md) | Final Markdown thesis text using the final benchmark evidence |
| [thesis/jisa.md](thesis/jisa.md) | JISA manuscript and submission security evidence |
| [slides/proofestate-nus-defense-presentation.pptx](slides/proofestate-nus-defense-presentation.pptx) | 15-slide NUS-style defense deck with complete read-aloud speaker notes |

## Limitations

- Registry data is mocked.
- Oracle trust is centralized.
- Groth16 setup artifacts are prototype-grade.
- No real ETH/ERC20 disbursement is implemented.
- No production KYC/AML/DID is implemented.
- No liquidation, delinquency, or risk engine is implemented.
- Proof freshness is not bound to expiry, borrower, nonce, or loan ID.
- Sepolia support is testnet validation only.

See [docs/limitations-and-extensions.md](docs/limitations-and-extensions.md) for the full limitations and future-work discussion.

## License

This repository does not currently include an open-source license. Except for viewing and forking as permitted by GitHub's platform functionality and Terms of Service, no permission is granted to copy, modify, distribute, sublicense, or use this work commercially without explicit permission from the author.

For public use, redistribution, or commercial use, contact the author first and add an explicit `LICENSE` file.
