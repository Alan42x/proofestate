# ZK Proof Design

## Statement

ProofEstate proves one lending rule:

```text
loanPrincipal * 10000 <= propertyValue * 8000
```

The proof demonstrates that a requested principal is no more than 80% of the property valuation without revealing `propertyValue` or `loanPrincipal` on-chain.

## Circuit

Source:

```text
circuits/ltv.circom
```

The main component is:

```text
LtvCompliance(64, 80)
```

Public inputs:

- `propertyKeyField`
- `valuationCommitment`
- `principalCommitment`
- `maxLtvBps`

Private inputs:

- `propertyValue`
- `loanPrincipal`
- `valuationSalt`
- `principalSalt`

## Property Field Mapping

The Oracle derives the on-chain property key with:

```text
propertyKey = ethers.id(propertyId)
```

The circuit field element is:

```text
propertyKeyField = uint256(propertyKey) mod SNARK_SCALAR_FIELD
```

`ComplianceVerifier.propertyIdToField(bytes32 propertyId)` performs the same modulo mapping on-chain.

## Commitments

The circuit uses `MiMCSponge(3, 220, 1)` with `k = 0`.

Valuation commitment:

```text
valuationCommitment = MiMC(propertyKeyField, propertyValue, valuationSalt)
```

Principal commitment:

```text
principalCommitment = MiMC(propertyKeyField, loanPrincipal, principalSalt)
```

The property key is included in both commitments so the same value cannot be cleanly replayed as an unrelated property proof. The valuation salt is deterministic in the current MVP, derived from the mock property record. The principal salt is random by default.

## Range Checks

The circuit applies:

- `Num2Bits(64)` to `propertyValue`.
- `Num2Bits(64)` to `loanPrincipal`.
- `Num2Bits(14)` to `maxLtvBps`.

The product comparison uses `LessThan(productBits=80)`.

This supports 64-bit value inputs while leaving enough room for multiplication by basis points:

```text
2^64 * 10000 < 2^80
```

## Inclusive LTV Comparison

Circomlib `LessThan(n)` proves strict `<`. The desired lending rule is inclusive `<=`.

The circuit encodes:

```text
loanPrincipal * 10000 < propertyValue * maxLtvBps + 1
```

For integer arithmetic, this is equivalent to:

```text
loanPrincipal * 10000 <= propertyValue * maxLtvBps
```

With `maxLtvBps = 8000`, the proof enforces 80% maximum LTV.

## On-Chain Binding

`ComplianceVerifier.verifyProofAndSetCompliance` checks every public signal before calling the Groth16 verifier:

| Public signal index | Expected value |
| ---: | --- |
| 0 | `propertyIdToField(propertyId)` |
| 1 | `PropertyVerification.valuationCommitmentOf(propertyId)` |
| 2 | `principalCommitment` supplied to the verifier call |
| 3 | `MAX_LTV_BPS`, currently `8000` |

If any signal differs, the contract reverts with `InvalidPublicSignal(index, expected, actual)`.

After signal checks pass, `LtvGroth16Verifier.verifyProof` verifies the Groth16 proof. The verifier then writes:

```text
PropertyVerification.setCompliant(propertyId, true, proofHash, principalCommitment)
```

The lending contract later requires:

```text
isCompliantFor(propertyId, principalCommitment)
```

This prevents approving a requested loan against a different principal commitment.

## Workflow

Proof generation:

1. Load property from `data/properties.{network}.json`.
2. Evaluate registry rules.
3. Compute `propertyKey` and `propertyKeyField`.
4. Compute valuation and principal commitments.
5. Build witness using `zk/build/ltv_js/ltv.wasm`.
6. Generate Groth16 proof using `zk/artifacts/ltv_final.zkey`.
7. Export Solidity calldata with snarkjs.

Verification:

1. Oracle or client submits proof and public signals to `ComplianceVerifier`.
2. Contract checks the property is verified.
3. Contract binds public signals to on-chain property and principal state.
4. Contract calls generated `LtvGroth16Verifier`.
5. Contract stores compliance and proof hash through `PropertyVerification`.

## Replay and Freshness Boundaries

The proof is bound to:

- `propertyId`, through `propertyKeyField`;
- current on-chain `valuationCommitment`;
- submitted `principalCommitment`;
- fixed `maxLtvBps`.

It is not bound to:

- a specific borrower address;
- a specific loan ID;
- a timestamp or expiry;
- a unique nonce stored on-chain.

Replay across property IDs is rejected because the property field and valuation commitment must match the target property. Replay across principal commitments is rejected by the public signal check. Reuse of the same proof for the same property and principal can refresh the same compliance state, which is acceptable for the MVP but should be tightened for production with proof freshness or nonce policy.

When `PropertyVerification.setVerified` refreshes a property record, it clears stale compliance and principal binding. A new proof must be generated against the new valuation commitment.

## Trusted Setup

The current Groth16 proving key and verifier are prototype artifacts under `zk/artifacts/` and `contracts/generated/`. They are suitable for local reproducibility and dissertation demonstration, not a production ceremony. A production deployment would require a documented trusted setup process or a proof system with different setup assumptions.

## Salt Risks

Salt reuse can leak equality relationships across proofs. In the MVP:

- valuation salt is deterministic for reproducibility against the mock registry;
- principal salt is random by default;
- salts and witness inputs must remain off-chain.

Production work should avoid deterministic valuation salts unless the registry commitment policy deliberately accepts linkability.
