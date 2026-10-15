# Deployment Guide

This guide describes how to reproduce the local ProofEstate prototype and how to treat Sepolia as optional public validation.

## Environment Requirements

| Requirement | Expected value |
| --- | --- |
| Node.js | Node 20 from `.nvmrc`; package engine range is `>=20 <23` |
| pnpm | 10.9.0, matching `packageManager` and the lockfile |
| Hardhat | Installed through project dependencies |
| circom | Required only for circuit rebuilds; `$HOME/.cargo/bin/circom`, `circom` on PATH, or `CIRCOM_BIN` |
| snarkjs | Installed through project dependencies |
| Wallet | Hardhat local accounts for local demo; funded wallet for Sepolia |

Recommended setup:

```bash
nvm use
pnpm install --frozen-lockfile
node -v
pnpm -v
```

The repository includes the matching circuit WASM, proving key, and generated Solidity verifier needed for the existing demo. No new trusted setup or `circom` installation is needed for ordinary reproduction. See [Circuit and Setup Rebuild](#circuit-and-setup-rebuild) when intentionally changing these artifacts.

## Local Reproduction Path

The local path is the canonical demo environment. Hardhat provides controlled chain execution without public RPC or faucet dependencies; wall-clock proof and workflow times still vary between runs.

1. Compile contracts:

```bash
pnpm compile
```

2. Start the local chain and keep its terminal running:

```bash
pnpm chain:local
```

3. In a second terminal, deploy contracts and sync local env files:

```bash
pnpm demo:deploy
```

This deploys five contracts and updates the tracked public manifest `deployments/localhost.json`. It also creates or updates the ignored runtime files `.env.local` and `frontend/.env.local` with local defaults.

4. Start the Oracle API in a separate terminal and keep it running:

```bash
pnpm oracle:api
```

5. Confirm readiness from another terminal:

```bash
pnpm demo:ready
```

Expected readiness:

- local RPC returns a block number;
- Oracle API returns `proofestate-oracle`;
- four core contract addresses contain code (`PropertyVerification`, `LtvGroth16Verifier`, `ComplianceVerifier`, and `Lending`);
- frontend local environment variables are present.

The API `/health` response is a process-liveness check. `demo:ready` does not exercise proof generation, role permissions, browser wallets, or the fifth contract, `RoleAdminManager`.

6. Run the end-to-end CLI demo:

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

The CLI calls the Oracle service functions directly and submits the loan actions through local signers. Its workflow duration does not measure HTTP response time or browser wallet interaction. Repayment changes contract state without transferring funds.

## Circuit and Setup Rebuild

Use these commands only when intentionally rebuilding the proof artifacts:

| Command | Effect |
| --- | --- |
| `pnpm zk:compile` | Recompiles the circuit into R1CS, WASM, and symbol files; leaves the existing proving key and verifier unchanged |
| `pnpm zk:setup` | Recreates setup artifacts, proving/verification keys, and the Solidity verifier from the compiled circuit |
| `pnpm zk:prove` | Generates and checks a sample proof; expects the matching `verification_key.json` produced by setup |
| `pnpm zk:build` | Runs circuit compilation, setup, and sample proof verification |

`zk:setup` and `zk:build` replace the existing proving key and generated verifier. The resulting proofs do not match a verifier deployed from the previous key. Recompile contracts and deploy the matching verifier and wrapper before using the new artifacts. If the circuit changes, recompile it before setup. Retain the checked-in artifact set when using the recorded public deployment.

For an intentional full rebuild before a new local deployment:

```bash
pnpm zk:build
pnpm compile
pnpm demo:deploy
```

The local chain must already be running for the deployment step. Circuit compilation uses `CIRCOM_BIN`, auto-detects `~/.cargo/bin/circom`, or falls back to `circom` on PATH. For a compiler at another path, set `CIRCOM_BIN` to that executable. The local setup script uses demonstration contributions and does not establish an audited ceremony.

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

- a development server, normally at `http://localhost:5173`;
- Hardhat RPC on `http://127.0.0.1:8545`;
- Oracle API on `http://localhost:8787`;
- deployment addresses in `frontend/.env.local`.

For the `PROP-001` flow, connect the borrower account below, complete verification and compliance, and request the loan. Switch to the loan-officer account to approve, then return to the original borrower to mark repayment. Verification/compliance writes use the backend Oracle signer; borrower and officer actions call `Lending` directly from their wallets.

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

To inspect the recorded deployment, set `SEPOLIA_RPC_URL` in the ignored root `.env.sepolia`, then run:

```bash
pnpm sepolia:inspect PROP-011
```

Inspection reads the tracked [Sepolia manifest](../deployments/sepolia.json) and chain state. It does not submit transactions or require private keys.

For a new deployment, configure these values in `.env.sepolia`:

| Variable | Purpose |
| --- | --- |
| `SEPOLIA_RPC_URL` | RPC endpoint |
| `DEPLOYER_PRIVATE_KEY` | Deployment signer |
| `ORACLE_PRIVATE_KEY` | Backend Oracle write signer; must match the account granted `ORACLE_ROLE` |
| `ADMIN_ADDRESS` | Protocol admin |
| `ORACLE_ADDRESS` | Account granted Oracle role |
| `LOAN_OFFICER_ADDRESS` | Account granted loan officer role |

Deploy from a funded Sepolia signer:

```bash
pnpm deploy:sepolia
```

The deployment command updates the public manifest and synchronizes addresses into `.env.sepolia` and `frontend/.env.sepolia`. Inspect the result:

```bash
pnpm sepolia:inspect PROP-011
```

Recorded Sepolia deployment and hosted-service links:

| Field | Address | Sepolia explorer |
| --- | --- | --- |
| Hosted Oracle API | `https://proofestate.onrender.com` | [Render endpoint](https://proofestate.onrender.com) |
| Admin / deployer | `0xfba672257e178Beaf9169e46889f155A1B682048` | [Etherscan](https://sepolia.etherscan.io/address/0xfba672257e178Beaf9169e46889f155A1B682048) |
| Oracle | `0xDc5DE2Dbc61179b5cA9Dec58E6f9396D406123B1` | [Etherscan](https://sepolia.etherscan.io/address/0xDc5DE2Dbc61179b5cA9Dec58E6f9396D406123B1) |
| Loan officer | `0x95AD85f77B3301373B9aC91192678C5B34E1325D` | [Etherscan](https://sepolia.etherscan.io/address/0x95AD85f77B3301373B9aC91192678C5B34E1325D) |
| Borrower / `PROP-011` owner | `0x82b8C1c43E3310E1f46fbcd00582Aedf1CEe81a4` | [Etherscan](https://sepolia.etherscan.io/address/0x82b8C1c43E3310E1f46fbcd00582Aedf1CEe81a4) |
| PropertyVerification | `0xd83Ae403f486e426F788731F81d4D9b4Ad2B014C` | [Etherscan](https://sepolia.etherscan.io/address/0xd83Ae403f486e426F788731F81d4D9b4Ad2B014C) |
| LtvGroth16Verifier | `0x19fC17237BEe1d3f7cc3ac0bFF48eB6CC460eeCf` | [Etherscan](https://sepolia.etherscan.io/address/0x19fC17237BEe1d3f7cc3ac0bFF48eB6CC460eeCf) |
| ComplianceVerifier | `0x3eaf3b87d7Ff602E4a6855ba80369ed763a1e2Cc` | [Etherscan](https://sepolia.etherscan.io/address/0x3eaf3b87d7Ff602E4a6855ba80369ed763a1e2Cc) |
| Lending | `0x5D7bcf02E3969B3e7cDD021407812710D96599DC` | [Etherscan](https://sepolia.etherscan.io/address/0x5D7bcf02E3969B3e7cDD021407812710D96599DC) |
| RoleAdminManager | `0xd3E9331b10DF04Cf84d128f9b5e499dd5D8d88Db` | [Etherscan](https://sepolia.etherscan.io/address/0xd3E9331b10DF04Cf84d128f9b5e499dd5D8d88Db) |

The manifest records deployment time `2026-08-26T07:52:02.900Z`; the addresses above match that file. Use inspection to establish chain state at the time of a demonstration. Only public addresses and service URLs are documented here; private keys and RPC secrets remain in ignored environment files.

To synchronize the recorded manifest without deploying:

```bash
pnpm sepolia:sync
```

This writes address configuration without sending transactions. Set `VITE_ORACLE_API_URL` in `frontend/.env.sepolia` to the intended API: synchronization retains an existing value or defaults to `http://localhost:8787`.

Run a local Oracle API against Sepolia:

```bash
pnpm oracle:api:sepolia
```

The Oracle host needs the matching `zk/build/ltv_js/ltv.wasm` and `zk/artifacts/ltv_final.zkey`, Sepolia RPC configuration, contract addresses, and the signer used for write-enabled requests. The server uses `PORT`, then `ORACLE_PORT`, then `8787`. Its health endpoint does not verify RPC access, roles, or proving artifacts. The API currently has no authentication or rate limiting, and compliant responses include witness values and salts; public reachability does not establish protected access.

Build Sepolia frontend configuration:

```bash
pnpm frontend:build:sepolia
```

Document Sepolia transaction hashes only after inspection. Label them as public validation, not local performance evidence.

## Hosted Frontend on Vercel

Hosted DApp: [proofestate.vercel.app](https://proofestate.vercel.app/).

Vite `VITE_*` variables are embedded at build time. Updating contract addresses or the Oracle API URL in Vercel requires updating the Vercel environment variables and redeploying the frontend; refreshing the browser is not enough.

Recommended Vercel configuration:

| Setting | Value |
| --- | --- |
| Root directory | `frontend` |
| Build command | `pnpm build --mode sepolia` |
| Output directory | `dist` |

Required public Vercel environment variables:

| Variable | Value source |
| --- | --- |
| `VITE_ORACLE_API_URL` | The intended hosted Oracle API URL; the recorded service link appears above |
| `VITE_SEPOLIA_RPC_URL` | Browser-safe Sepolia RPC URL |
| `VITE_DEFAULT_NETWORK` | `sepolia` |
| `VITE_ADMIN_ADDRESS` | Inspected target deployment manifest |
| `VITE_ORACLE_ADDRESS` | Inspected target deployment manifest |
| `VITE_LOAN_OFFICER_ADDRESS` | Inspected target deployment manifest |
| `VITE_PROPERTY_VERIFICATION_ADDRESS` | Inspected target deployment manifest |
| `VITE_LTV_GROTH16_VERIFIER_ADDRESS` | Inspected target deployment manifest |
| `VITE_COMPLIANCE_VERIFIER_ADDRESS` | Inspected target deployment manifest |
| `VITE_LENDING_ADDRESS` | Inspected target deployment manifest |
| `VITE_ROLE_ADMIN_MANAGER_ADDRESS` | Inspected target deployment manifest |

Never set `DEPLOYER_PRIVATE_KEY`, `ORACLE_PRIVATE_KEY`, or backend-only RPC secrets in Vercel frontend variables. After changing any `VITE_*` value, trigger a fresh redeploy. If the DApp still shows old contract addresses, redeploy without the old build cache and confirm the deployment was built after the environment variable update.

## Generated and Runtime Files

Ignored local runtime files:

- `.env.local`
- `.env.sepolia`
- `frontend/.env.local`
- `frontend/.env.sepolia`

Tracked public deployment manifests:

- `deployments/localhost.json`
- `deployments/sepolia.json`

These manifests are imported by the frontend build and must contain public addresses only. They may be regenerated by deployment scripts; commit changes only after inspecting the target network and confirming that no private key or RPC secret has been written.

Ignored build outputs include:

- `artifacts/`
- `cache/`
- `frontend/dist/`

The circuit files in `zk/build/`, proving key `zk/artifacts/ltv_final.zkey`, and verifier `contracts/generated/LtvGroth16Verifier.sol` are tracked reproduction assets. Other files created under `zk/artifacts/`, such as setup contributions and `verification_key.json`, are ignored. Git LFS is configured for `demo/*.mp4`; it is not used for the proving key.

Public documentation should cite inspected deployment addresses from tracked documents or tracked deployment manifests, with the inspection date and network clearly labeled.

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `demo:ready` fails local RPC | Hardhat node is not running | Start `pnpm chain:local` |
| `demo:ready` fails Oracle API | Oracle server is not running | Start `pnpm oracle:api` |
| Deployment addresses have no code | Chain was restarted after deploy | Rerun `pnpm demo:deploy` |
| `circom --version` fails during an intentional rebuild | Compiler missing or not on PATH | Install the compiler and set `CIRCOM_BIN`, or use the checked-in artifacts for the existing demo |
| Proof fails against an existing deployment after setup | New proving key does not match deployed verifier | Restore its matching artifact set or deploy the rebuilt verifier and wrapper |
| Oracle write fails | Missing signer/private key or wrong role | Rerun env sync and confirm deployment roles |
| Frontend shows missing address | `frontend/.env.local` stale | Rerun `pnpm demo:sync` or `pnpm demo:deploy` |
| Hosted frontend shows old Sepolia address | Vercel `VITE_*` variables or build cache are stale | Update Vercel env values and redeploy without the old build cache |
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
