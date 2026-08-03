# ProofEstate

ProofEstate is an Ethereum prototype for privacy-preserving real-estate lending. It combines a mock property registry, an Oracle service, Groth16 zero-knowledge proof generation, role-gated Solidity contracts, and a React DApp.

The project proves one lending rule:

```text
loanPrincipal * 10000 <= propertyValue * 8000
```

This is equivalent to proving `loanPrincipal <= 80% of propertyValue` without publishing the plaintext property valuation or loan principal on-chain. The chain stores commitments, proof hashes, ownership, verification/compliance state, and loan lifecycle state.

ProofEstate is a dissertation prototype, not a production lending protocol. Real disbursement, KYC/AML, liquidation, production registry integration, monitoring, and decentralized Oracle governance are intentionally out of scope.

## Current Evidence Snapshot

Latest local test and gas evidence was revalidated on 2026-08-03 with Node `v20.20.2`.

| Evidence | Status |
| --- | --- |
| Contract tests | 28 passing |
| Oracle API tests | 12 passing |
| Frontend tests | 6 passing |
| Frontend production build | Passing |
| Gas snapshot | Passing |
| ZK compile | Passing with circom `2.2.3` |
| Local readiness check | Passing |
| Local CLI happy path | Passing, final state `Repaid` |
| Formal local benchmark | 5 warm-up + 30 measured runs, regenerated on 2026-08-03 |

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

In this sequence figure, `PV`, `CV`, and `L` refer to `PropertyVerification`, `ComplianceVerifier`, and `Lending`.

### Loan State Machine

![Loan state machine](docs/figures/06-loan-state-machine.png)

The Mermaid source files live in [docs/figures](docs/figures/).

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
  deploy.js
  sync-local-env.js
  sync-sepolia-env.js
  local-demo-check.js
  local-wallet-flow.js
  benchmark-local.mjs
  zk-build.mjs

test/
  proofestate.test.js

docs/
  figures/
  benchmarks/
  demo/
```

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
pnpm zk:compile
pnpm zk:setup
pnpm zk:prove
```

or:

```bash
pnpm zk:build
```

The project script auto-detects `$HOME/.cargo/bin/circom` when present. If needed, set:

```bash
export CIRCOM_BIN="$HOME/.cargo/bin/circom"
```

## Local Demo

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

For a defense-ready walkthrough, see:

- [docs/demo/demo-checklist.md](docs/demo/demo-checklist.md)
- [docs/demo/local-demo-script.md](docs/demo/local-demo-script.md)
- [docs/demo/fallback-plan.md](docs/demo/fallback-plan.md)

## Frontend

Run the local DApp:

```bash
pnpm frontend:dev:local
```

Build:

```bash
pnpm frontend:build:local
```

The local DApp expects:

- Hardhat RPC at `http://127.0.0.1:8545`;
- Oracle API at `http://localhost:8787`;
- deployment addresses in `frontend/.env.local`.

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

Formal local benchmark command:

```bash
pnpm benchmark:local --warmups=5 --runs=30 --property=PROP-001 --principal=750000 --api=http://127.0.0.1:8787
```

Raw data:

```text
docs/benchmarks/raw/local-2026-08-03T14-49-27-759Z.json
```

Summary:

| Metric | Median | Mean | P95 |
| --- | ---: | ---: | ---: |
| Build verification input | 3.65 ms | 3.73 ms | 4.79 ms |
| Build compliance inputs | 5.02 ms | 5.35 ms | 7.10 ms |
| Generate Groth16 proof | 547.53 ms | 573.10 ms | 682.98 ms |
| Oracle `/verify` latency | 7.70 ms | 8.11 ms | 10.04 ms |
| Oracle `/compliance` latency | 555.20 ms | 583.46 ms | 702.65 ms |

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

## Sepolia

Sepolia is optional public validation, not the primary evidence path.

Useful commands:

```bash
pnpm deploy:sepolia
pnpm sepolia:inspect
pnpm oracle:api:sepolia
pnpm frontend:build:sepolia
```

Do not mix Sepolia latency with local benchmark tables. See [docs/demo/sepolia-demo-notes.md](docs/demo/sepolia-demo-notes.md) and [docs/deployment-guide.md](docs/deployment-guide.md).

## Documentation Index

| Document | Purpose |
| --- | --- |
| [docs/evaluation-notes.md](docs/evaluation-notes.md) | Latest Node 20 evidence snapshot |
| [docs/benchmarks/final-benchmarks.md](docs/benchmarks/final-benchmarks.md) | Formal local benchmark results |
| [docs/zk-proof-design.md](docs/zk-proof-design.md) | ZK statement, signals, circuit behavior, replay/freshness boundaries |
| [docs/smart-contract-interface-spec.md](docs/smart-contract-interface-spec.md) | Contract interface and revert/event specification |
| [docs/security-evaluation-report.md](docs/security-evaluation-report.md) | Threat model, mitigations, assumptions, residual risks |
| [docs/architecture-comparison.md](docs/architecture-comparison.md) | Comparison against plaintext, off-chain, alternative ZK, and Oracle designs |
| [docs/design-decisions.md](docs/design-decisions.md) | Architectural rationale and trade-offs |
| [docs/limitations-and-extensions.md](docs/limitations-and-extensions.md) | Prototype boundaries and future work |
| [docs/generalization.md](docs/generalization.md) | How the architecture can generalize to other privacy-preserving compliance applications |
| [docs/deployment-guide.md](docs/deployment-guide.md) | Local and Sepolia reproduction guide |
| [docs/demo/demo-checklist.md](docs/demo/demo-checklist.md) | Defense demo checklist |
| [thesis/final-thesis.md](thesis/final-thesis.md) | Final Markdown thesis text using the final benchmark evidence |
| [slides/defense-presentation-outline.md](slides/defense-presentation-outline.md) | Defense presentation structure and demo story |

## Environment Files

Ignored runtime files:

```text
.env.local
.env.sepolia
frontend/.env.local
frontend/.env.sepolia
deployments/*.json
```

Generated build/runtime folders:

```text
artifacts/
cache/
frontend/dist/
zk/build/
zk/artifacts/
```

Do not commit private keys, RPC secrets, or ignored deployment state.

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
