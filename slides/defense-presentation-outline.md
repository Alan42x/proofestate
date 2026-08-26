# ProofEstate Defense Presentation Outline

Target length: 10-15 minutes plus demo and questions.

## Slide 1: Title

ProofEstate: Privacy-Preserving Real-Estate Lending Verification Using Zero-Knowledge Proofs and Smart Contracts

Include:

- name;
- programme;
- supervisor;
- date;
- repository/demo pointer if appropriate.

## Slide 2: Problem

Message:

```text
Real-estate lending needs property and loan verification, but public-chain verification can expose sensitive valuation and principal data.
```

Explain:

- property valuation is sensitive;
- requested loan principal is sensitive;
- lenders still need enforceable compliance evidence.

## Slide 3: Research Goal

State:

```text
Demonstrate an end-to-end workflow where an 80% LTV rule is proven privately and enforced on chain.
```

Scope:

- one LTV rule;
- dissertation prototype;
- no production disbursement or liquidation.

## Slide 4: System Architecture

Use:

```text
docs/figures/01-system-architecture.png
```

Talk track:

- React DApp;
- Oracle service;
- ZK prover;
- Solidity contracts;
- mock registry;
- local chain and optional Sepolia.

## Slide 5: End-to-End Workflow

Use:

```text
docs/figures/05-end-to-end-data-flow.png
```

Flow:

```text
Property verification
-> commitment storage
-> proof generation
-> on-chain verification
-> loan request
-> approval
-> repayment
```

## Slide 6: ZK Statement

Show:

```text
loanPrincipal * 10000 <= propertyValue * 8000
```

Private:

- property value;
- loan principal;
- valuation salt;
- principal salt.

Public:

- property key field;
- valuation commitment;
- principal commitment;
- max LTV basis points.

## Slide 7: Smart Contract Enforcement

Explain:

- `ComplianceVerifier` checks all public signals;
- generated Groth16 verifier validates the proof;
- `PropertyVerification` stores compliant status and proof hash;
- `Lending` requires `isCompliantFor(propertyId, principalCommitment)`;
- active loan lock prevents duplicate active borrowing.

## Slide 8: Demo Flow

Show:

- wallet readiness;
- property verification;
- compliance proof success;
- loan request;
- loan officer approval;
- repayment.

Fallback evidence:

```text
docs/screenshots/
README.md
docs/deployment-guide.md
```

## Slide 9: Testing Evidence

Use final numbers from:

```text
docs/evaluation-notes.md
```

Current evidence to verify before final slides:

- contract tests;
- Oracle API tests;
- frontend tests;
- frontend build;
- gas snapshot;
- local happy path.

## Slide 10: Benchmark Results

Use final table from:

```text
docs/benchmarks/final-benchmarks.md
```

Show:

- proof generation median/mean/p95;
- Oracle `/verify` latency;
- Oracle `/compliance` latency;
- `verifyProofAndSetCompliance` gas;
- local E2E flow duration;
- circuit constraint count.

## Slide 11: Architecture Comparison

Use:

```text
docs/architecture-comparison.md
```

Compare briefly:

- plaintext on-chain verification;
- off-chain-only verification;
- Groth16 ZK proof;
- PLONK/STARK alternatives;
- centralized versus threshold Oracle.

Main message:

```text
ProofEstate trades production decentralization for a narrow, reproducible, privacy-preserving MVP with on-chain enforcement.
```

## Slide 12: Security Evaluation

Use:

```text
docs/security-evaluation-report.md
```

Mention:

- role-gated writes;
- proof binding;
- stale compliance clearing;
- principal-specific approval;
- active collateral lock;
- malformed input rejection.

## Slide 13: Limitations

Be explicit:

- centralized Oracle;
- mock registry;
- prototype trusted setup;
- no production identity;
- no real disbursement;
- no liquidation;
- no proof freshness nonce or expiry;
- Sepolia is optional validation.

## Slide 14: Future Work

Prioritize:

- signed registry attestations;
- threshold Oracle;
- proof freshness;
- more compliance rules;
- alternative proof systems;
- production settlement and monitoring.

## Slide 15: Conclusion

Close with:

```text
ProofEstate shows that sensitive lending constraints can influence on-chain loan decisions without publishing the underlying valuation or principal.
```

## Demo Checklist

Before the defense:

- run `pnpm test:all`;
- run `pnpm test:gas`;
- start local chain;
- run `pnpm demo:deploy`;
- start Oracle API;
- run `pnpm demo:ready`;
- confirm screenshots are available;
- prepare CLI fallback;
- avoid relying on Sepolia unless already captured.
