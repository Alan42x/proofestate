# ZK Proof Design

## Statement

ProofEstate proves one lending rule:

```text
loanPrincipal * 10000 <= propertyValue * 8000
```

The proof demonstrates that a requested principal is no more than 80% of the property valuation without revealing `propertyValue` or `loanPrincipal` on-chain.

## Circuit

Source: [circuits/ltv.circom](../circuits/ltv.circom).

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

Keccak hashing and the modulo conversion occur outside the circuit. The circuit receives only the resulting field element. Modulo reduction is not injective over all `bytes32` values; property separation assumes no collision in the application identifiers and their mapped field elements, together with commitment binding.

## Commitments

The circuit uses `MiMCSponge(3, 220, 1)` with its MiMC key input fixed to zero. This key input is distinct from `propertyKeyField`, which is the first message input to each commitment.

Valuation commitment:

```text
valuationCommitment = MiMC(propertyKeyField, propertyValue, valuationSalt)
```

Principal commitment:

```text
principalCommitment = MiMC(propertyKeyField, loanPrincipal, principalSalt)
```

Including the property field in both commitments binds the values to that property context under the identifier and commitment assumptions above. The valuation salt is deterministic in the prototype, derived from available property context. The principal salt is random by default. Neither choice establishes confidentiality when the registry or API discloses the values and salts.

## Range Checks

The circuit applies:

- `Num2Bits(64)` to `propertyValue`.
- `Num2Bits(64)` to `loanPrincipal`.
- `Num2Bits(14)` to `maxLtvBps`.

The product comparison uses `LessThan(productBits=80)`.

Both scaled products are below `2^78` because the values are below `2^64` and both `10000` and the 14-bit policy input are below `2^14`:

```text
loanPrincipal * 10000 < 2^78
propertyValue * maxLtvBps < 2^78
```

The right-hand side plus one remains within the 80-bit comparator domain and far below the BN254 scalar-field modulus, so the comparison does not wrap around the field. The unsigned range checks permit zero; positive-principal and registry-valuation rules are separate Oracle checks.

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

With `maxLtvBps = 8000`, the proof enforces 80% maximum LTV. The circuit accepts a 14-bit policy input; `ComplianceVerifier` fixes the application's accepted policy to `8000`.

## On-Chain Binding

`ComplianceVerifier.verifyProofAndSetCompliance` first requires a currently verified property, then checks every public signal before calling the Groth16 verifier. Proof submission is permissionless; the wrapper holds the role required to write compliance.

| Public signal index | Expected value |
| ---: | --- |
| 0 | `propertyIdToField(propertyId)` |
| 1 | `PropertyVerification.valuationCommitmentOf(propertyId)` |
| 2 | `principalCommitment` supplied to the verifier call |
| 3 | `MAX_LTV_BPS`, currently `8000` |

If any signal differs, the contract reverts with `InvalidPublicSignal(index, expected, actual)`.

After signal checks pass, `LtvGroth16Verifier.verifyProof` verifies the Groth16 proof. The wrapper `ComplianceVerifier` computes `proofHash = keccak256(abi.encode(a, b, c, publicSignals))` and calls:

```text
PropertyVerification.setCompliant(propertyId, true, proofHash, principalCommitment)
```

The lending contract later requires:

```text
isCompliantFor(propertyId, principalCommitment)
```

The submitted principal commitment is checked against the proof, rather than against a loan record during proof submission. At approval, `Lending` compares the stored compliance commitment with the requested loan's commitment. Compliance occupies one mutable slot per property.

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
3. Contract binds public signals to the property field, current valuation commitment, submitted principal commitment, and fixed policy.
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
- a unique nonce stored on-chain;
- a registry version, chain ID, or deployment address.

Property substitution is rejected when the target property field or valuation commitment differs. Changing the principal commitment is rejected by the public signal check. These checks establish context binding under the stated assumptions; they do not make a proof single-use.

Every `PropertyVerification.setVerified` call clears compliance and principal binding. If the valuation commitment is unchanged and the property remains verified, the identical proof can restore compliance. If the commitment changes, a proof matching that commitment is required. There is no proof-consumption or freshness check.

Accepting another principal's proof replaces the property's compliance slot. A pending request with the old commitment remains `Requested` until an action is taken; a subsequent approval attempt rejects it and releases its lock. A refresh after approval does not change an already approved loan. Ownership is checked at request, without an approval-time recheck. See the [contract interface specification](smart-contract-interface-spec.md#lending) for lifecycle behavior.

## Trusted Setup

The checked-in proving key, WASM, and generated Solidity verifier form the matching artifact set used for reproduction. The setup script uses local contributions with demonstration entropy strings and does not establish an independently audited ceremony. Soundness remains conditional on an uncompromised setup.

Ordinary reproduction uses the checked-in artifacts. `pnpm zk:setup` and `pnpm zk:build` replace the proving key and generated verifier; using the resulting proofs requires recompilation and deployment of the matching verifier contracts. See the [deployment guide](deployment-guide.md#circuit-and-setup-rebuild) before regenerating them.

## Salt Risks

Reusing the same value, salt, and property context repeats the commitment, making the corresponding records linkable. In the prototype:

- valuation salt is deterministic for reproducibility against the mock registry;
- principal salt is random by default;
- salts and witness inputs are omitted from on-chain proof calldata, but compliant API responses expose them through `proofInputs`.

Available property context makes deterministic valuation salts reproducible and can permit offline testing of candidate valuations. Random principal blinding does not protect responses that disclose the witness. A confidentiality design would require suitable secret randomness, restricted responses, and control over the underlying data source.
