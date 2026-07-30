# Sepolia Demo Notes

Sepolia should be used as optional public validation. It is valuable for showing that contracts can be deployed to a public Ethereum testnet, but it should not replace the local demo or local benchmark evidence.

## When to Use Sepolia

Use Sepolia only when:

- `.env.sepolia` contains a working RPC URL;
- the deployer or Oracle account has enough Sepolia ETH;
- deployment addresses have been inspected;
- the wallet is already configured for the expected network;
- the demo schedule can tolerate RPC or testnet delays.

## Commands

Deploy and sync:

```bash
pnpm deploy:sepolia
```

Inspect deployment:

```bash
pnpm sepolia:inspect
```

Start Oracle API:

```bash
pnpm oracle:api:sepolia
```

Build frontend:

```bash
pnpm frontend:build:sepolia
```

## Evidence Rules

Sepolia evidence should include:

- network name;
- deployment date;
- inspected contract addresses;
- transaction hashes;
- signer role used;
- link to public explorer if available.

Sepolia evidence should not be used for:

- local latency benchmark claims;
- stable performance claims;
- proof-generation timing;
- reproducibility claims that depend on faucet or RPC availability.

## Demo Positioning

Recommended wording:

```text
The canonical evaluation is local and reproducible. Sepolia is included as optional public validation that the same contract architecture can run on a public Ethereum testnet.
```

This avoids overstating testnet reliability while still using public transactions as useful supporting evidence.
