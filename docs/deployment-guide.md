# Deployment Guide

This guide describes how to reproduce the local ProofEstate prototype and how to treat Sepolia as optional public validation.

## Environment Requirements

| Requirement | Expected value |
| --- | --- |
| Node.js | Node 20 from `.nvmrc` |
| pnpm | 10.x or the project lockfile-compatible version |
| Hardhat | Installed through project dependencies |
| circom | `$HOME/.cargo/bin/circom`, `circom` on PATH, or `CIRCOM_BIN` |
| snarkjs | Installed through project dependencies |
| Wallet | Hardhat local accounts for local demo; funded wallet for Sepolia |

Recommended setup:

```bash
nvm use
pnpm install
node -v
pnpm -v
```

If `circom` is not on PATH, either rely on `scripts/zk-build.mjs` auto-detecting `~/.cargo/bin/circom`, or set:

```bash
export CIRCOM_BIN="$HOME/.cargo/bin/circom"
```

## Local Reproduction Path

The local path is the canonical dissertation demo because it is deterministic and does not depend on external RPC or faucet state.

1. Compile contracts:

```bash
pnpm compile
```

2. Optional: rebuild ZK circuit artifacts:

```bash
pnpm zk:compile
pnpm zk:setup
pnpm zk:prove
```

For a full ZK rebuild:

```bash
pnpm zk:build
```

3. Start local chain:

```bash
pnpm chain:local
```

4. In a second terminal, deploy contracts and sync local env files:

```bash
pnpm demo:deploy
```

This writes ignored runtime files:

- `deployments/localhost.json`
- `.env.local`
- `frontend/.env.local`

5. Start Oracle API:

```bash
pnpm oracle:api
```

6. Confirm readiness:

```bash
pnpm demo:ready
```

Expected readiness:

- local RPC returns a block number;
- Oracle API returns `proofestate-oracle`;
- deployed contract addresses contain code;
- frontend local environment variables are present.

7. Run the end-to-end CLI demo:

```bash
pnpm demo:flow PROP-001 750000
```

Expected result:

- Oracle writes property verification;
- Oracle generates and submits compliance proof;
- borrower requests loan;
- loan officer approves;
- borrower repays;
- final state is `Repaid`.

## Frontend Local Demo

Start the DApp:

```bash
pnpm frontend:dev:local
```

Build production bundle:

```bash
pnpm frontend:build:local
```

The local DApp expects:

- Hardhat RPC on `http://127.0.0.1:8545`;
- Oracle API on `http://localhost:8787`;
- deployment addresses in `frontend/.env.local`.

## Local Demo Accounts

| Role | Address |
| --- | --- |
| Admin / deployer | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` |
| Oracle | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` |
| Loan officer | `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` |
| Borrower for `PROP-001` | `0x90F79bf6EB2c4f870365E785982E1f101E93b906` |

These are public Hardhat accounts. Do not fund them on public networks.

## Sepolia Deployment

Sepolia is optional validation. It should not be the primary dependency for dissertation evidence.

Required ignored file:

```text
.env.sepolia
```

Required values typically include:

| Variable | Purpose |
| --- | --- |
| `SEPOLIA_RPC_URL` | RPC endpoint |
| `DEPLOYER_PRIVATE_KEY` | Deployment signer |
| `ORACLE_PRIVATE_KEY` | Oracle write signer |
| `ADMIN_ADDRESS` | Protocol admin |
| `ORACLE_ADDRESS` | Account granted Oracle role |
| `LOAN_OFFICER_ADDRESS` | Account granted loan officer role |

Deploy:

```bash
pnpm deploy:sepolia
```

Inspect:

```bash
pnpm sepolia:inspect
```

Run Oracle API against Sepolia:

```bash
pnpm oracle:api:sepolia
```

Build Sepolia frontend configuration:

```bash
pnpm frontend:build:sepolia
```

Document Sepolia transaction hashes only after inspection. Label them as public validation, not local performance evidence.

## Generated and Runtime Files

Ignored local runtime files:

- `.env.local`
- `.env.sepolia`
- `frontend/.env.local`
- `frontend/.env.sepolia`
- `deployments/*.json`

Generated build files:

- `artifacts/`
- `cache/`
- `frontend/dist/`
- `zk/build/`
- `zk/artifacts/`

Public documentation should not depend on ignored deployment JSON files. If final Sepolia addresses are included in the dissertation, copy inspected addresses into a tracked document with the inspection date and network.

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `demo:ready` fails local RPC | Hardhat node is not running | Start `pnpm chain:local` |
| `demo:ready` fails Oracle API | Oracle server is not running | Start `pnpm oracle:api` |
| Deployment addresses have no code | Chain was restarted after deploy | Rerun `pnpm demo:deploy` |
| `circom --version` fails | `~/.cargo/bin` not on PATH | Set `CIRCOM_BIN` or add cargo bin to PATH |
| Oracle write fails | Missing signer/private key or wrong role | Rerun env sync and confirm deployment roles |
| Frontend shows missing address | `frontend/.env.local` stale | Rerun `pnpm demo:sync` or `pnpm demo:deploy` |
| Sepolia transaction hangs | RPC congestion or insufficient funds | Treat Sepolia as optional and use local demo |

## Reproducibility Checklist

Before collecting final evidence, record:

- OS and CPU;
- Node and pnpm versions;
- Hardhat, snarkjs, and circom versions;
- git commit hash;
- exact commands;
- timestamps;
- output paths;
- whether results are local or Sepolia.
