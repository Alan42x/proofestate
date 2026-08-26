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

## Current Public Deployment

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

Use `PROP-011` with principal `600000` for the Sepolia happy path. Its mock registry valuation is `850000`, so the request is inside the 80% LTV rule.

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
