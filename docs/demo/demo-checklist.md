# ProofEstate Demo Checklist

This checklist is designed for final rehearsal and live defense use.

## Pre-Demo Verification

| Check | Command | Expected result |
| --- | --- | --- |
| Node version | `node -v` | Node 20.x |
| Dependencies | `pnpm -v` | pnpm available |
| Contract compile | `pnpm compile` | Passing |
| Full test suite | `pnpm test:all` | Passing |
| Gas snapshot | `pnpm test:gas` | Passing |
| ZK compile | `pnpm zk:compile` | `ltv.r1cs`, `ltv.sym`, `ltv.wasm` written |

## Local Services

Start local chain:

```bash
pnpm chain:local
```

Deploy and sync:

```bash
pnpm demo:deploy
```

Start Oracle API:

```bash
pnpm oracle:api
```

Confirm readiness:

```bash
pnpm demo:ready
```

Expected readiness:

- local RPC returns a block number;
- Oracle API returns `proofestate-oracle`;
- deployment addresses contain contract code;
- `frontend/.env.local` has required values.

## Happy Path Scenario

Command:

```bash
pnpm demo:flow PROP-001 750000
```

Expected sequence:

1. Property verification transaction mined.
2. Compliance proof transaction mined.
3. Loan request submitted.
4. Loan officer approval submitted.
5. Borrower repayment submitted.
6. Final loan state is `Repaid`.

## Demo Accounts

| Role | Address |
| --- | --- |
| Admin / deployer | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` |
| Oracle | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` |
| Loan officer | `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` |
| Borrower for `PROP-001` | `0x90F79bf6EB2c4f870365E785982E1f101E93b906` |

These are public Hardhat demo accounts only. Never fund them on a public network.

## Failure Scenarios

Above-limit LTV:

```bash
PROOFESTATE_ENV_FILE=.env.local node backend/oracle/cli.js compliance PROP-001 784001
```

Invalid registry record:

```bash
PROOFESTATE_ENV_FILE=.env.local node backend/oracle/cli.js compliance PROP-004 100000
```

Expected:

- bad inputs fail explicitly;
- proof generation is skipped when the property or LTV rule fails;
- contract approval cannot proceed without matching compliance.

## Fallback Order

1. Live local DApp.
2. Local CLI flow.
3. Local screenshots or recorded video.
4. Sepolia transaction evidence.
5. Architecture and proof workflow figures.

## Freeze Checklist

Before final submission, freeze:

- exact git commit;
- Node/pnpm/Hardhat/snarkjs/circom versions;
- final gas table;
- final benchmark raw data;
- final PNG figures;
- screenshots or demo recording;
- Sepolia addresses only if inspected and current.
