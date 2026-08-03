# Architecture Comparison

This document compares ProofEstate's selected architecture with plausible alternatives. It is intended to support the dissertation evaluation chapter and a shortened defense-slide comparison.

## Comparison Summary

| Architecture | Privacy | On-chain gas | Latency | Trust assumptions | Implementation complexity | Prototype fit | Production readiness |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Plaintext on-chain verification | Weak: valuation and principal are public | Low to medium | Low after transaction inclusion | Smart contract correctness only | Low | Poor, because it fails the privacy goal | Medium for simple public workflows |
| Off-chain-only verification | Medium to strong, depending on backend | None for verification | Low off-chain, no on-chain finality | Backend operator and database | Low to medium | Poor, because it lacks on-chain enforcement | Medium for conventional private lending |
| ProofEstate Groth16 + commitments | Strong for valuation and principal on chain | Medium: verifier gas is significant but practical | Proof generation dominates local latency | Oracle, Groth16 setup, verifier correctness | Medium | Strong | Low to medium without production Oracle and setup hardening |
| PLONK or universal-setup ZK | Strong for private inputs | Medium to high depending verifier | Similar or higher than Groth16 in many EVM settings | Universal setup or proof-system assumptions | Medium to high | Medium | Medium if tooling and verifier cost are acceptable |
| STARK-style ZK | Strong for private inputs | Often high on EVM because proofs are larger | Potentially higher verification and calldata overhead | Hash/security assumptions, no trusted setup | High | Medium to weak for this MVP | Medium for systems prioritizing transparent setup |
| Centralized Oracle | Depends on downstream proof and commitments | Low to medium | Low operational overhead | One Oracle service is trusted for registry interpretation | Low | Strong | Low without governance, attestations, monitoring, and key management |
| Threshold Oracle | Depends on downstream proof and commitments | Medium to high | Higher due to coordination | Honest threshold or committee assumptions | High | Weak to medium for MVP | Higher than centralized Oracle if operated well |
| On-chain property registry | Weak unless values are committed or encrypted | High storage and update costs | Transaction-bound | Registry contract and update authority | Medium to high | Weak for private valuation | Medium only with authenticated production data source |
| Oracle-written commitment registry | Strong for hidden values if commitments are sound | Medium | Oracle update plus proof workflow | Oracle and commitment policy | Medium | Strong | Medium with signed source attestations and freshness policy |

## Selected Architecture

ProofEstate uses:

```text
Mock registry
-> centralized Oracle
-> MiMC valuation and principal commitments
-> Groth16 proof generation
-> on-chain public signal binding
-> role-gated lending lifecycle
-> React DApp
```

This architecture is selected because it demonstrates the core research idea end to end while keeping the prototype narrow enough to implement, test, benchmark, and defend.

## Why Not Plaintext On-Chain Verification

Plaintext verification would be the simplest implementation. A borrower could submit the property valuation and requested principal directly to a smart contract, and the contract could evaluate:

```text
loanPrincipal * 10000 <= propertyValue * 8000
```

This would reduce ZK complexity and proof-generation latency, but it would fail the central privacy requirement. Property valuations and loan principals are sensitive financial data. Publishing them on chain would make them permanently visible and linkable to the borrower and property record.

Conclusion: plaintext verification is a useful baseline, but it is not an acceptable design for the privacy-preserving objective.

## Why Not Off-Chain-Only Verification

An off-chain-only system could keep valuation and principal private inside a backend service. It would be faster and cheaper than an on-chain ZK verifier, but the result would not be independently enforceable by smart contracts.

The lender, borrower, and auditor would need to trust the backend's database and application logic. This removes the main benefit of combining ZK proofs with smart contracts: a private fact can influence public contract state without revealing the fact itself.

Conclusion: off-chain-only verification is practical for conventional systems, but weaker for auditable decentralized enforcement.

## Why Groth16 Fits This Prototype

Groth16 is well suited to ProofEstate because:

- the proof statement is fixed and narrow;
- proof size is small;
- EVM verification gas is practical for a dissertation prototype;
- Circom and snarkjs provide a mature local toolchain;
- the generated Solidity verifier integrates directly with Hardhat tests and deployment scripts.

The main trade-off is the trusted setup. In ProofEstate this is acceptable only because the setup artifacts are prototype-grade and the limitation is explicitly documented. A production version would need a documented ceremony or a different proof system.

Conclusion: Groth16 is the best fit for a narrow, reproducible MVP, but not automatically the best production choice.

## PLONK and Universal-Setup Alternatives

PLONK-style systems reduce the burden of circuit-specific trusted setup by using universal or updatable setup approaches. This can be attractive for production systems that expect frequent circuit changes.

The trade-off is additional verifier complexity, potentially higher gas depending on the exact proving system and Solidity verifier, and a larger implementation surface. For this project, the LTV rule is intentionally fixed, so Groth16's circuit-specific setup is a reasonable prototype compromise.

Conclusion: PLONK is a strong future-work candidate if the architecture expands to multiple compliance rules or frequently changing policies.

## STARK-Style Alternatives

STARK-style systems avoid trusted setup and can provide strong transparency properties. They are attractive for systems where setup assumptions are unacceptable.

For an EVM-based dissertation prototype, the drawbacks are proof size, calldata overhead, verifier complexity, and integration effort. These costs would distract from the main goal: demonstrating a complete privacy-preserving lending workflow.

Conclusion: STARKs are worth discussing as a setup-transparent alternative, but they are less suitable for this MVP's EVM-focused implementation.

## Oracle Design Alternatives

### Centralized Oracle

The current Oracle reads a mock property registry, evaluates deterministic registry rules, computes commitments, generates ZK proofs, and optionally writes verification/compliance state on chain.

This keeps the prototype reproducible and understandable. The drawback is clear: the Oracle is trusted to interpret registry facts correctly and to protect plaintext witness material.

### Threshold Oracle

A threshold Oracle would reduce trust in one operator by requiring multiple independent services to attest to property facts. This would improve production credibility, but it would add:

- committee membership management;
- consensus or aggregation logic;
- signer coordination;
- dispute handling;
- higher operational complexity.

For this dissertation prototype, implementing threshold Oracle governance would become a separate research project.

### On-Chain Registry

An on-chain property registry would make source data auditable, but storing valuations directly on chain would harm privacy. Storing commitments on chain is more compatible with ProofEstate, but still requires an authority to write correct commitments from real registry records.

Conclusion: the current centralized Oracle is appropriate for the MVP, while signed registry attestations and threshold Oracle verification are the most important future extensions.

## Recommended Dissertation Comparison Table

| Dimension | Plaintext on chain | Off-chain only | ProofEstate Groth16 | PLONK-style ZK | STARK-style ZK |
| --- | --- | --- | --- | --- | --- |
| Valuation privacy | No | Yes, backend-private | Yes, commitment + proof | Yes | Yes |
| Principal privacy | No | Yes, backend-private | Yes, commitment + proof | Yes | Yes |
| On-chain enforcement | Yes | No | Yes | Yes | Yes |
| Verifier gas | Low | None | Medium | Medium/high | Often high on EVM |
| Proof generation | None | None | Moderate | Moderate/high | Moderate/high |
| Trusted setup | None | None | Circuit-specific | Universal/updatable in many systems | None |
| Main trust point | Public contract | Backend | Oracle + setup + contract | Oracle + setup model + contract | Oracle + proof system + contract |
| Best use | Public data workflows | Conventional private backend | Narrow private compliance proof | Flexible ZK policy systems | Setup-transparent ZK systems |

## Final Position

ProofEstate's architecture is not the simplest possible system. It is selected because it balances privacy, on-chain enforceability, prototype feasibility, and dissertation clarity.

The strongest claim is:

```text
Compared with plaintext on-chain verification, ProofEstate preserves valuation and principal privacy.
Compared with off-chain-only verification, ProofEstate provides smart-contract-enforced compliance.
Compared with broader ZK and Oracle alternatives, ProofEstate makes a deliberate MVP trade-off: Groth16 efficiency and centralized Oracle reproducibility over production-grade decentralization.
```

