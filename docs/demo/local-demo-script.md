# Local Demo Script

This script is the recommended talk track for a live local defense demo. The goal is to show the complete workflow without depending on Sepolia.

## Claim to Demonstrate

ProofEstate proves:

```text
loanPrincipal * 10000 <= propertyValue * 8000
```

The borrower can demonstrate LTV compliance without publishing plaintext property valuation or plaintext loan principal on-chain.

## Setup

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
```

Expected:

- local RPC reachable;
- Oracle API reachable;
- contracts deployed;
- frontend environment synced.

## Main Demo

Run:

```bash
pnpm demo:flow PROP-001 750000
```

Narration:

1. `PROP-001` is loaded from the mock registry.
2. The Oracle evaluates deterministic registry rules.
3. The Oracle writes `setVerified` with a valuation commitment, not plaintext valuation.
4. The proof workflow generates a Groth16 proof for the 80% LTV rule.
5. `ComplianceVerifier` checks public signals against on-chain state.
6. `Lending.requestLoan` stores the principal commitment and locks the property.
7. The loan officer approves after `isCompliantFor` confirms proof/principal binding.
8. The borrower repays and the active property lock is released.

Expected final output:

```text
stateLabel: Repaid
```

## Failure Demo

Use an above-limit principal:

```bash
PROOFESTATE_ENV_FILE=.env.local node backend/oracle/cli.js compliance PROP-001 784001
```

Expected:

- result is non-compliant;
- no valid compliance proof is written;
- the loan cannot be validly approved for that principal commitment.

Use an invalid registry property:

```bash
PROOFESTATE_ENV_FILE=.env.local node backend/oracle/cli.js compliance PROP-004 100000
```

Expected:

- registry evaluation fails because the property is encumbered;
- proof generation is skipped.

## Closing Point

The demo is intentionally local-first. Sepolia can show public deployment evidence, but local execution is the reproducible evidence path for tests, gas snapshots, and benchmark methodology.
