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

The local demo is the canonical reproducible path for testing, benchmarking, and defense preparation. It runs a Hardhat chain, deploys contracts locally, starts the Oracle API, and executes the full loan lifecycle.

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

## Sepolia Validation

Sepolia is optional public validation, not the primary evidence path. Use it to show that the same contracts and Oracle workflow run on a public Ethereum testnet. Do not mix Sepolia latency with local benchmark tables.

### Required Files

Sepolia uses two ignored runtime env files:

| File | Used by | Contains |
| --- | --- | --- |
| `.env.sepolia` | Hardhat scripts and Oracle API | RPC URL, private signers, role addresses, deployed contract addresses |
| `frontend/.env.sepolia` | Vite DApp | Public RPC URL, public role addresses, deployed contract addresses, Oracle API URL |

Never commit private keys or RPC secrets.

### Signers

Use separate keys for protocol maintenance and Oracle writes:

```env
DEPLOYER_PRIVATE_KEY=0x...
ORACLE_PRIVATE_KEY=0x...
```

`DEPLOYER_PRIVATE_KEY` is the deployment or maintenance signer. `ORACLE_PRIVATE_KEY` is the signer used by the Oracle API when it writes Sepolia transactions. The address derived from `ORACLE_PRIVATE_KEY` must match `ORACLE_ADDRESS` and must have `ORACLE_ROLE` on-chain.

### Deploy Or Inspect

Deploy or inspect the Sepolia contracts:

```bash
pnpm deploy:sepolia
pnpm sepolia:inspect
```

If contracts are already deployed, prefer `pnpm sepolia:inspect` before sending new transactions. It checks contract bytecode, roles, selected property state, and recent loan state.

### Run Locally Against Sepolia

Terminal 1:

```bash
pnpm oracle:api:sepolia
```

Terminal 2:

```bash
pnpm frontend:dev:sepolia
```

Open the local frontend, connect a Sepolia wallet, keep `Oracle writes chain` enabled, and run property verification before generating the compliance proof.

For `PROP-011`, use the borrower wallet configured in `data/properties.sepolia.json`. Its valuation is `850000`, so a test principal such as `600000` is inside the 80% LTV rule.

### Expected Sepolia Flow

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

### Sepolia Troubleshooting

If the frontend shows `RPC` or `Contracts` as not ready, it usually means the frontend RPC cannot read the latest block or contract bytecode. It does not necessarily mean the contracts are missing.

Common causes:

- RPC rate limiting, especially `429 Too Many Requests`;
- unstable public Sepolia RPC endpoint;
- Vite dev server was started without `--mode sepolia`;
- wallet is connected to the wrong chain;
- frontend env changed but the dev server was not restarted.

Property verification and compliance writes wait for Sepolia transaction receipts. A wait of 15-120 seconds can be normal on testnet; longer waits usually point to RPC throttling, a pending transaction, or insufficient test ETH.

Recommended setup:

```text
.env.sepolia              -> stable backend RPC for Oracle writes
frontend/.env.sepolia     -> separate stable frontend RPC for browser reads
```

After changing either env file, restart both services.

### Frontend Deployment Note

The frontend can be deployed to Vercel or another static host, but the Oracle API must be hosted separately behind a public HTTPS URL. Do not put `DEPLOYER_PRIVATE_KEY` or `ORACLE_PRIVATE_KEY` in frontend hosting environment variables.

For hosted frontend builds:

```text
Root directory: frontend
Build command: pnpm build --mode sepolia
Output directory: dist
```

Set `VITE_ORACLE_API_URL` to the hosted Oracle API URL, not `http://localhost:8787`.
Set `FRONTEND_URL` on the hosted Oracle API to the deployed DApp URL so the Oracle landing page links back to the public frontend.

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
