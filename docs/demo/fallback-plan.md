# Demo Fallback Plan

The defense demo should be resilient to wallet, RPC, browser, and testnet failure. The project should never depend on Sepolia being live at the exact presentation moment.

## Priority Order

| Priority | Demo path | Use when |
| ---: | --- | --- |
| 1 | Live local DApp | Browser, wallet, local RPC, and Oracle are stable |
| 2 | Local CLI flow | Browser or wallet state is unreliable |
| 3 | Local screenshots or recorded video | Live services fail during defense |
| 4 | Sepolia transaction evidence | Public validation is useful and already captured |
| 5 | Architecture and proof figures | Runtime demo cannot proceed |

## Failure Response

| Failure | Response |
| --- | --- |
| Hardhat RPC unavailable | Restart `pnpm chain:local`, then rerun `pnpm demo:deploy` |
| Oracle API unavailable | Restart `pnpm oracle:api`, then rerun `pnpm demo:ready` |
| Deployment state stale | Rerun `pnpm demo:deploy` |
| Frontend env stale | Rerun `pnpm demo:sync` or `pnpm demo:deploy` |
| Wallet wrong network | Switch to local network or use CLI fallback |
| Sepolia RPC slow | Skip Sepolia live demo and show local evidence |
| Proof generation slow | Continue with CLI output or screenshot backup |

## Minimum Successful Defense

If all live execution fails, the minimum defensible fallback is:

- show system architecture figure;
- show ZK proof workflow figure;
- show latest `docs/evaluation-notes.md` results;
- show gas table;
- show local demo screenshots or recorded output;
- explain limitations and future work.

## Materials to Freeze

Before final rehearsal, freeze:

- PNG figures under `docs/figures/`;
- final benchmark raw data;
- local demo command output;
- screenshots under `docs/demo/screenshots/`;
- Sepolia transaction hashes if used;
- final git commit hash.
