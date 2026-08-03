# ProofEstate: Blockchain-Based Real-Estate Lending Platform with Zero-Knowledge Compliance and Property Verification

## Abstract

Real-estate lending depends on verifiable facts: property ownership, property valuation, borrower authorization, and policy constraints such as maximum loan-to-value (LTV). Public blockchains can make the resulting approval workflow auditable and programmatically enforceable, but their transparency also makes naive implementations unsuitable for sensitive lending data. If valuation and requested-principal values are submitted directly to a smart contract, they may become permanently visible through calldata, events, or contract state. This creates a central design tension: the workflow benefits from public enforcement, while the facts that determine eligibility should remain confidential.

This thesis presents ProofEstate, an end-to-end prototype for privacy-preserving real-estate lending verification. ProofEstate combines a mock property registry, a trusted oracle service, MiMC commitments, a Groth16 zero-knowledge proof, Ethereum-compatible smart contracts, and a React decentralized application. The implemented proof statement is intentionally narrow:

```text
loanPrincipal * 10000 <= propertyValue * 8000
```

The proof establishes that the requested principal is no more than 80 percent of the property valuation without publishing either plaintext value on chain. The blockchain records commitments, proof hashes, ownership and verification state, compliance state, and loan lifecycle state; it does not store plaintext valuation, plaintext principal, salts, or witness files.

The prototype implements a complete local workflow in which the oracle verifies a mock property record, computes commitments, generates Groth16 proof calldata, submits proof data to an on-chain verifier, and enables a role-gated lending contract to approve or reject a loan only when compliance is bound to the relevant property and principal commitment. The accompanying DApp exposes borrower, loan-officer, administrator, readiness, and audit views for demonstration and evaluation.

The evaluation is local-first to preserve reproducibility. It includes 28 passing contract tests, 12 passing oracle API tests, 6 passing frontend tests, a passing frontend production build, a gas baseline, circuit-size inspection, local end-to-end demo evidence, and a 30-run benchmark of the successful proof-generation path. The benchmark shows that Groth16 proof generation dominates local latency: median proof generation is 547.53 ms, while median oracle `/compliance` latency is 555.20 ms. The measured average gas for `ComplianceVerifier.verifyProofAndSetCompliance` is 310411.

ProofEstate is not a production lending protocol. It uses a mock registry, a centralized oracle, prototype Groth16 setup artifacts, and no real ETH/ERC20 disbursement, KYC/AML, liquidation, production monitoring, or decentralized oracle governance. Its contribution is a bounded but complete architecture pattern: sensitive off-chain facts can be committed, proven against a specific compliance rule in zero knowledge, and used to drive auditable smart-contract state without revealing the underlying values on chain.

**Keywords:** zero-knowledge proofs, smart contracts, real-estate lending, privacy-preserving compliance, Groth16, oracle, commitments

## 1. Introduction

### 1.1 Motivation

Blockchain systems are attractive for workflows that require transparent state transitions, programmable enforcement, and auditable records. Ethereum-style smart contracts can encode rules, restrict functions to authorized roles, emit events, and preserve application state in a form that can be independently inspected [1], [2]. These properties are relevant to lending because property verification, loan approval, collateral state, repayment state, and administrative actions should be reliable, traceable, and resistant to unilateral modification.

The same transparency creates a privacy problem. Contract calldata, logs, and storage can be inspected by external observers. In real-estate lending, sensitive information can include property valuation, requested principal, borrower identity, ownership history, income evidence, and lender-specific risk decisions. A simple smart contract could verify a loan-to-value (LTV) rule by accepting plaintext valuation and principal values, but that design would permanently reveal the financial facts used in the decision.

Zero-knowledge proofs provide a mechanism for separating validity from disclosure. A prover can demonstrate that private witness values satisfy a public statement without revealing those witness values. For a lending rule, this means a system can prove that a requested principal is within a maximum LTV threshold while keeping both the property valuation and the requested principal off chain.

ProofEstate explores this design through a concrete end-to-end prototype. It does not attempt to implement a full mortgage system or decentralized finance lending market. Instead, it focuses on a narrower research objective: enabling private off-chain property and loan values to influence public smart-contract state through commitments, proof verification, and explicit application-level binding checks.

### 1.2 Research Question

The main research question is:

```text
Can a real-estate lending workflow enforce an LTV compliance rule on chain without revealing the underlying property valuation or requested loan principal?
```

The question is decomposed into five design and evaluation subquestions:

1. How can off-chain property facts be represented on chain without publishing plaintext valuation data?
2. How can a zero-knowledge proof be bound to a specific property and requested principal commitment?
3. How can smart contracts prevent loan approval when compliance is missing, stale, or bound to a different principal?
4. What are the proof-generation, API-latency, circuit-size, and gas costs of the design in a reproducible local environment?
5. What trust assumptions remain after introducing zero-knowledge proofs?

### 1.3 Contributions

This thesis makes the following contributions:

1. It designs and implements an end-to-end privacy-preserving lending prototype using an oracle service, MiMC commitments, Groth16 proof generation, Solidity contracts, and a React DApp.
2. It specifies a zero-knowledge LTV circuit with four public inputs, four private inputs, property-bound commitments, range checks, and an inclusive 80 percent LTV constraint.
3. It implements smart-contract binding checks that connect proof public signals to current on-chain property state and principal commitments before loan approval.
4. It evaluates the system with contract tests, oracle API tests, frontend tests, gas measurements, proof-generation benchmarks, circuit-size inspection, frontend build output, and local end-to-end demo evidence.
5. It compares the selected architecture with plaintext on-chain verification, off-chain-only verification, alternative proof systems, and alternative oracle models.
6. It documents the prototype's bounded security claim, privacy boundary, trust assumptions, residual risks, limitations, and generalization path.

### 1.4 Scope and Non-Goals

The implemented compliance rule is:

```text
loanPrincipal * 10000 <= propertyValue * 8000
```

This is equivalent to proving:

```text
loanPrincipal <= 80 percent of propertyValue
```

The rule is intentionally narrow. A single lending policy can be specified, implemented, tested, benchmarked, and explained rigorously. ProofEstate does not implement real disbursement, fiat settlement, ETH/ERC20 transfers, KYC/AML, credit scoring, liquidation, delinquency handling, production registry integration, production monitoring, or decentralized oracle governance. These omissions define the boundary of the research prototype rather than hidden production claims.

### 1.5 Thesis Organization

Section 2 introduces background concepts and related work. Section 3 describes the system design. Section 4 presents the implementation. Section 5 reports the evaluation methodology and results. Section 6 analyzes security and privacy. Section 7 compares architectural alternatives and discusses generalization. Section 8 presents limitations and future work. Section 9 concludes.

## 2. Background and Related Work

### 2.1 Ethereum-Compatible Smart Contracts

Smart contracts are deterministic programs deployed to a blockchain. Ethereum-compatible contracts execute on the Ethereum Virtual Machine (EVM), where they can store state, validate transactions, emit events, and call other contracts. Because contract execution is replicated and validated by the network, smart contracts are useful when participants need shared state and predictable enforcement [1], [2].

ProofEstate uses Solidity contracts on a local Hardhat network, with optional Sepolia deployment support. The local network is the canonical evaluation environment because it provides deterministic execution, stable accounts, repeatable gas measurement, and independence from public testnet RPC or faucet conditions.

### 2.2 Role-Based Access Control

Lending workflows require distinct permissions for different actors. A property oracle should be able to write verification records, but it should not approve loans. A loan officer should be able to approve or reject requested loans, but it should not overwrite property valuations. A protocol administrator should manage roles, while accidental removal of the final administrator should be prevented.

ProofEstate uses role-based access control patterns based on OpenZeppelin Contracts [3]. The main roles are:

- `ORACLE_ROLE` for property verification writes;
- `COMPLIANCE_ROLE` for compliance writes by `ComplianceVerifier`;
- `LOAN_OFFICER_ROLE` for loan approval and rejection;
- `DEFAULT_ADMIN_ROLE` for role administration.

This role separation supports least privilege and makes the system's security boundary easier to audit.

### 2.3 Oracles

Blockchains cannot directly read external systems such as property registries, identity providers, land-title databases, or bank records. Oracles bridge external data into smart-contract applications. Decentralized oracle networks are commonly used to reduce reliance on a single operator, while centralized oracles are simpler and easier to reproduce in a prototype [12].

ProofEstate uses a centralized oracle service. It reads a mock property registry, evaluates deterministic verification rules, computes commitments, constructs proof inputs, generates Groth16 proof calldata, and can submit verification and compliance transactions. This choice is appropriate for a reproducible research prototype, but it introduces a clear trust assumption: the oracle sees plaintext witness values and is trusted to interpret registry facts honestly.

### 2.4 Commitments

A commitment binds a value without revealing it. ProofEstate uses commitments so that smart contracts can refer to hidden valuation and principal values without storing them directly. The circuit computes:

```text
valuationCommitment = MiMC(propertyKeyField, propertyValue, valuationSalt)
principalCommitment = MiMC(propertyKeyField, loanPrincipal, principalSalt)
```

MiMC is selected because it is designed for low multiplicative complexity and is efficient in arithmetic-circuit settings [5]. Ethereum-native hashes such as Keccak are natural on chain, but expensive inside Circom-style arithmetic circuits. Including `propertyKeyField` in both commitments binds the hidden values to a property context and reduces straightforward replay across unrelated properties.

### 2.5 Zero-Knowledge Proofs

A zero-knowledge proof allows a prover to convince a verifier that a statement is true without revealing the private witness. ProofEstate uses Groth16, a succinct non-interactive argument system whose compact proofs and practical verifier cost make it widely used in blockchain applications [4].

Groth16's main trade-off is trusted setup. It requires proving and verification artifacts tied to a specific circuit. In ProofEstate, these artifacts are prototype-grade and suitable for local reproducibility and thesis demonstration. A production system would need a documented trusted setup ceremony or a proof system with different setup assumptions. The circuit is written in Circom and proof generation is performed with snarkjs [6], [7].

### 2.6 Loan-to-Value Policy

Loan-to-value ratio compares a loan amount with collateral value:

```text
LTV = loanPrincipal / propertyValue
```

ProofEstate implements an 80 percent maximum LTV policy. Instead of division, the circuit and contracts use integer multiplication in basis points:

```text
loanPrincipal * 10000 <= propertyValue * 8000
```

This avoids decimal arithmetic and gives the circuit a precise integer constraint.

### 2.7 Related Systems

Decentralized lending protocols such as Compound and Aave demonstrate how smart contracts can manage collateralized borrowing, interest, liquidity pools, and repayment state [10], [11]. These protocols primarily operate with crypto-native assets and public on-chain collateral values. ProofEstate differs by focusing on real-estate-style collateral, where relevant facts originate off chain and may be private.

Oracle systems such as Chainlink and related decentralized oracle designs illustrate how external data and off-chain computation can be connected to on-chain applications [12]. ProofEstate uses a simpler centralized oracle to keep the prototype reproducible. This choice is not production-grade, but it isolates the research contribution from the separate problem of oracle decentralization.

Zero-knowledge proof systems differ in setup assumptions, proof size, prover time, verifier time, and implementation maturity. Groth16 provides compact proofs and efficient verification but requires circuit-specific setup [4]. PLONK-style systems can support universal or updatable setup, making them attractive for applications with evolving circuits [8]. STARK-style systems avoid trusted setup and provide transparency, but proof size and EVM verification cost can be higher [9].

ProofEstate belongs to the broader category of privacy-preserving compliance systems: applications that prove a user, asset, or transaction satisfies a policy without revealing all underlying data. Similar patterns can apply to income verification, identity eligibility, insurance claims, accredited-investor checks, and asset-backed lending. The important design principle is minimal disclosure. ProofEstate hides valuation and principal from public-chain observers, but it does not hide the property key, owner address, compliance state, proof hash, or loan lifecycle state. This bounded privacy claim is more defensible than a claim of full borrower anonymity.

## 3. System Design

### 3.1 Design Requirements

ProofEstate is designed around five requirements:

1. The property valuation and requested principal must not be stored in plaintext on chain.
2. The on-chain verifier must reject proofs whose public signals do not match the target property and requested principal commitment.
3. The lending contract must reject loan approval when compliance is absent, stale, or bound to a different principal commitment.
4. The prototype must be reproducible in a local environment without depending on public testnet availability.
5. The remaining trust assumptions must be explicit rather than hidden behind the zero-knowledge proof.

These requirements shape the architecture. The oracle handles off-chain registry interpretation and proof generation. Commitments represent private values on chain. The zero-knowledge proof verifies policy satisfaction. Smart contracts bind proof outputs to application state and enforce the loan lifecycle.

### 3.2 Architecture Overview

ProofEstate combines off-chain fact processing with on-chain verification and enforcement.

![System architecture](../docs/figures/01-system-architecture.png)

*Figure 1. ProofEstate system architecture showing the off-chain registry/oracle layer, zero-knowledge proving workflow, and on-chain verification and lending contracts.*

The architecture contains the following components:

- a React DApp for user interaction;
- a Node.js oracle API;
- a mock property registry;
- a Circom/snarkjs Groth16 proving workflow;
- Solidity contracts for verification, compliance, lending, and role administration;
- a local Hardhat chain as the canonical demo and evaluation environment.

The high-level data flow is:

```text
Property registry
-> oracle verification
-> commitment generation
-> ZK proof generation
-> on-chain proof verification
-> loan request
-> loan approval or rejection
-> repayment or closure
```

### 3.3 Actors

The main actors are:

| Actor | Responsibility |
| --- | --- |
| Property owner / borrower | Initiates verification, compliance proof generation, loan request, cancellation, and repayment |
| Oracle service | Reads registry data, computes commitments, generates proofs, and writes verification/compliance transactions |
| Loan officer | Approves or rejects requested loans |
| Protocol admin | Manages protocol administration roles |
| Auditor / evaluator | Reviews contract state, events, benchmark results, screenshots, and documentation |

### 3.4 Workflow

![End-to-end data flow](../docs/figures/05-end-to-end-data-flow.png)

*Figure 2. End-to-end data flow from property-registry lookup to proof-bound compliance verification, loan approval, and repayment.*

The workflow proceeds as follows:

1. The borrower connects a wallet to the DApp.
2. The DApp requests property verification from the oracle API.
3. The oracle reads the mock registry and checks eligibility rules.
4. The oracle writes a verified property record with a valuation commitment.
5. The borrower requests compliance proof generation for a principal.
6. The oracle constructs witness inputs and public signals.
7. The oracle generates a Groth16 proof.
8. `ComplianceVerifier` checks all public signals against on-chain state.
9. The generated verifier validates the proof.
10. `PropertyVerification` records compliance and the principal commitment.
11. The borrower requests a loan with the property ID and principal commitment.
12. `Lending` checks property ownership, verification, compliance, and principal binding.
13. A loan officer approves or rejects the loan.
14. The borrower repays the approved loan, releasing the active collateral lock.

### 3.5 Data Visibility Boundary

The system is designed for confidentiality against public-chain observers for two values: property valuation and requested principal. These values are private witness inputs to the circuit and are represented on chain only through commitments.

The system deliberately leaves some information public. The property key, owner address, valuation commitment, principal commitment, proof hash, compliance state, and loan lifecycle state are visible. This visibility is sufficient for auditable contract enforcement, but it does not provide anonymity. The oracle also sees plaintext witness values during proof construction. ProofEstate therefore demonstrates privacy-preserving compliance, not anonymous lending and not oracle-private computation.

### 3.6 Local-First Evaluation Strategy

Local execution is the canonical evidence path. It avoids public testnet instability, faucet availability problems, RPC congestion, and variable transaction inclusion time. Sepolia support remains useful as optional public validation, but local data is the only source used for final performance claims.

This design choice improves reproducibility. An evaluator can run tests, gas snapshots, proof generation, and the local demo without depending on external infrastructure.

## 4. Implementation

### 4.1 Repository Structure

The repository is organized as follows:

```text
contracts/
backend/oracle/
circuits/
zk/
frontend/
scripts/
test/
docs/
```

The `contracts/` folder contains Solidity contracts and the generated Groth16 verifier. The `backend/oracle/` folder contains the oracle API and property-verification logic. The `circuits/` and `zk/` folders contain the Circom circuit, ZK build outputs, and proof-generation helpers. The `frontend/` folder contains the React DApp. The `scripts/` folder contains deployment, synchronization, demo, ZK build, and benchmark scripts. The `docs/` folder contains design, benchmark, security, deployment, and demo evidence.

### 4.2 Smart Contracts

The security-critical on-chain layer is divided into five core contracts.

#### PropertyVerification

`PropertyVerification` stores oracle-written property verification records and verifier-written compliance records. It tracks:

- whether a property is verified;
- owner address;
- evidence hash;
- valuation commitment;
- compliance status;
- proof hash;
- principal commitment;
- update timestamp.

`setVerified` requires `ORACLE_ROLE`. When a property is refreshed, stale compliance and stale principal binding are cleared. This prevents an old proof from remaining valid after a property record changes.

`setCompliant` requires `COMPLIANCE_ROLE`. In deployment, that role is granted to `ComplianceVerifier`, preventing arbitrary accounts from writing compliance state directly.

#### ComplianceVerifier

`ComplianceVerifier` is the bridge between application state and the generated Groth16 verifier. It does not accept a proof merely because the verifier returns true. Before proof verification, it checks each public signal against the current application state:

| Public signal | Required value |
| ---: | --- |
| 0 | `propertyIdToField(propertyId)` |
| 1 | `PropertyVerification.valuationCommitmentOf(propertyId)` |
| 2 | submitted `principalCommitment` |
| 3 | fixed `MAX_LTV_BPS`, currently `8000` |

Only after these checks pass does it call `LtvGroth16Verifier.verifyProof`. If the proof is valid, it writes compliant status, proof hash, and principal commitment to `PropertyVerification`.

This binding is essential. Without it, a proof could be mathematically valid but unrelated to the target property, valuation, or principal used in loan approval.

#### Lending

`Lending` manages the loan lifecycle:

```text
Requested
-> Approved
-> Repaid
```

or:

```text
Requested
-> Rejected / Cancelled
```

The contract requires the caller to be the recorded property owner when requesting a loan. During approval, it checks:

- the property is verified;
- the property is compliant;
- compliance is bound to the same principal commitment;
- the caller has `LOAN_OFFICER_ROLE`;
- no invalid state transition is attempted.

The contract also enforces one active loan per property. This prevents duplicate active borrowing against the same collateral within the prototype model.

![Loan state machine](../docs/figures/06-loan-state-machine.png)

*Figure 3. Loan lifecycle state machine for the prototype lending contract. Requested loans may be approved, rejected, cancelled, or repaid according to role and borrower checks.*

#### RoleAdminManager

`RoleAdminManager` coordinates protocol admin grants and revocations across `PropertyVerification`, `Lending`, and itself. It also prevents removal of the final admin. This reduces the risk of accidental administrative lockout during demonstration and testing.

#### Generated Groth16 Verifier

`LtvGroth16Verifier` is generated from the Groth16 proving artifacts. It performs the pairing-based proof verification used by `ComplianceVerifier`. The generated verifier is treated as part of the proof-system artifact set and is tied to the current circuit.

### 4.3 Oracle Service

The oracle service performs four responsibilities:

1. It reads mock property records.
2. It evaluates deterministic property verification rules.
3. It computes commitments and proof inputs.
4. It generates and optionally submits compliance proof transactions.

The service exposes API endpoints for health checks, property listing, property verification, and compliance proof generation. It validates property IDs, network labels, and principal values before building proof inputs. Invalid requests fail explicitly rather than causing unhandled server errors.

The oracle is trusted in the prototype. It observes plaintext valuation and principal during proof generation. The privacy claim is therefore on-chain privacy, not oracle-private computation. Future work should replace or reduce this centralized trust point through signed registry attestations, threshold oracle verification, or a stronger credential model.

### 4.4 ZK Circuit

The circuit source is:

```text
circuits/ltv.circom
```

It proves:

```text
loanPrincipal * 10000 <= propertyValue * maxLtvBps
```

with `maxLtvBps = 8000`.

![ZK proof workflow](../docs/figures/04-zk-proof-workflow.png)

*Figure 4. Zero-knowledge proof workflow showing witness construction, commitment generation, Groth16 proof generation, public-signal binding, and on-chain verification.*

The public inputs are:

| Input | Meaning |
| --- | --- |
| `propertyKeyField` | property ID mapped into the SNARK scalar field |
| `valuationCommitment` | commitment to property valuation |
| `principalCommitment` | commitment to requested principal |
| `maxLtvBps` | maximum LTV threshold in basis points |

The private inputs are:

| Input | Meaning |
| --- | --- |
| `propertyValue` | plaintext valuation from the mock registry |
| `loanPrincipal` | plaintext requested principal |
| `valuationSalt` | salt for valuation commitment |
| `principalSalt` | salt for principal commitment |

The circuit uses `MiMCSponge(3, 220, 1)` with `k = 0`. It applies 64-bit range checks to `propertyValue` and `loanPrincipal`, a 14-bit range check to `maxLtvBps`, and an 80-bit comparison for the multiplied values.

Circomlib's `LessThan` proves strict less-than. ProofEstate needs an inclusive less-than-or-equal condition. The circuit therefore checks:

```text
loanPrincipal * 10000 < propertyValue * maxLtvBps + 1
```

For integer arithmetic, this is equivalent to:

```text
loanPrincipal * 10000 <= propertyValue * maxLtvBps
```

### 4.5 React DApp

The React DApp supports the end-to-end demonstration and inspection workflow. It includes:

- wallet readiness;
- property browsing;
- property verification;
- compliance proof generation;
- loan request;
- loan officer approval;
- repayment;
- role administration;
- contract readiness;
- event and audit views.

The DApp improves usability and observability, but it does not replace contract validation. The contracts and oracle API remain responsible for enforcing security-critical checks. The screenshots below use local mock values for demonstration; they should not be interpreted as evidence that plaintext valuation or principal values are stored on chain.

![DApp compliance proof workspace](../docs/demo/screenshots/03-compliance-proof-success.png)

*Figure 5. DApp compliance proof workspace after successful proof generation for `PROP-001` and principal `750000`. The view shows the calculated LTV, maximum borrow amount, principal commitment, proof verification status, and matched proof binding.*

### 4.6 Reproducibility Artifacts

The repository includes implementation and evidence artifacts intended to support independent review:

- contract interface documentation;
- ZK proof design documentation;
- security evaluation notes;
- benchmark summaries and raw benchmark JSON;
- local deployment and demo instructions;
- screenshots for fallback demonstration evidence;
- a final benchmark raw file with clean git metadata.

The final benchmark raw file is:

```text
docs/benchmarks/raw/local-2026-08-03T14-49-27-759Z.json
```

It records git commit `4f2acc59d660c7d3666b9f55861b58f13995431c` with `dirty: false`.

## 5. Evaluation

### 5.1 Methodology

The evaluation is local-first. This choice is deliberate: local execution is reproducible, independent of public RPC availability, and suitable for consistent gas and proof-generation measurements. The results should therefore be interpreted as controlled prototype measurements, not public-network throughput claims.

The final benchmark was collected with:

```bash
pnpm benchmark:local --warmups=5 --runs=30 --property=PROP-001 --principal=750000 --api=http://127.0.0.1:8787
```

The benchmark uses 5 warm-up iterations and 30 measured iterations. The first five iterations are excluded from summary statistics. The evaluated property is `PROP-001`, and the principal is `750000`. The benchmark measures local latency and excludes Sepolia transaction latency.

The final benchmark environment is:

| Item | Value |
| --- | --- |
| OS | Darwin 23.1.0 x64 |
| CPU | Intel(R) Core(TM) i7-9750H CPU @ 2.60GHz |
| Node | v20.20.2 |
| pnpm | 10.9.0 |
| Hardhat | 2.28.6 |
| snarkjs | 0.7.6 |
| circom | 2.2.3 at `$HOME/.cargo/bin/circom` |
| Git commit | `4f2acc59d660c7d3666b9f55861b58f13995431c` |
| Git dirty flag | `false` |
| Network label | `localhost` |

### 5.2 Functional Evidence

The final functional evidence is:

| Evidence | Result |
| --- | --- |
| Contract tests | 28 passing |
| Oracle API tests | 12 passing |
| Frontend tests | 6 passing |
| Frontend production build | Passing |
| Gas snapshot | Passing |
| ZK compile | Passing with circom 2.2.3 |
| Local readiness check | Passing |
| Local CLI happy path | Passing, final state `Repaid` |
| DApp screenshot evidence | Captured local workflow states from readiness to audit log |

The contract tests cover deployment, role configuration, property verification, compliance verification, public signal mismatch rejection, tampered proof rejection, stale compliance clearing, loan lifecycle transitions, duplicate active-loan prevention, borrower-only restrictions, loan officer enforcement, and admin protection.

The oracle API tests cover service readiness, owner-scoped property listing, unsupported network rejection, property ID validation, principal validation, non-compliant behavior, and registry verification failure behavior.

The frontend tests cover representative wallet-readiness and table-rendering behavior. The frontend production build passes, with a known Vite chunk-size warning that does not fail the build.

### 5.3 Benchmark Workload

`PROP-001` has a mock registry valuation of `980000`. Under the 80 percent LTV rule:

```text
980000 * 8000 / 10000 = 784000
```

The benchmark principal `750000` is compliant. This final benchmark therefore measures the successful proof-generation path; non-compliant and invalid-registry paths are covered by tests but are not included in the latency table.

### 5.4 Latency Results

| Metric | Runs | Failures | Min ms | Median ms | Mean ms | P95 ms | Max ms | Std dev |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Build verification input | 30 | 0 | 2.88 | 3.65 | 3.73 | 4.79 | 4.92 | 0.50 |
| Build compliance inputs | 30 | 0 | 4.48 | 5.02 | 5.35 | 7.10 | 7.87 | 0.72 |
| Generate Groth16 proof | 30 | 0 | 532.51 | 547.53 | 573.10 | 682.98 | 691.24 | 49.14 |
| Oracle `/verify` latency | 30 | 0 | 6.58 | 7.70 | 8.11 | 10.04 | 14.49 | 1.45 |
| Oracle `/compliance` latency | 30 | 0 | 539.48 | 555.20 | 583.46 | 702.65 | 721.27 | 51.27 |

The results show that proof generation dominates local latency. Building verification and compliance inputs is fast, with median times near or below 5 ms. Oracle `/verify` is also fast because it evaluates registry rules and computes commitments. Oracle `/compliance` has a median latency of 555.20 ms because it includes Groth16 proof generation.

The difference between proof-generation median latency and Oracle `/compliance` median latency is small:

```text
555.20 ms - 547.53 ms = 7.67 ms
```

This indicates that API overhead is relatively small compared with proving time in the successful local path.

### 5.5 Gas Results

Gas results use the Node 20 evaluation baseline generated with Hardhat gas reporter:

```bash
REPORT_GAS=true hardhat test
```

| Contract | Method | Average gas |
| --- | --- | ---: |
| `PropertyVerification` | `setVerified` | 115996 |
| `ComplianceVerifier` | `verifyProofAndSetCompliance` | 310411 |
| `Lending` | `requestLoan` | 233609 |
| `Lending` | `approveLoan` | 81464 |
| `Lending` | `cancelLoan` | 52694 |
| `Lending` | `rejectLoan` | 52620 |
| `Lending` | `repay` | 57219 |
| `RoleAdminManager` | `grantProtocolAdmin` | 120499 |
| `RoleAdminManager` | `revokeProtocolAdmin` | 55099 |

Deployment gas:

| Contract | Average gas |
| --- | ---: |
| `PropertyVerification` | 771511 |
| `ComplianceVerifier` | 417315 |
| `LtvGroth16Verifier` | 411178 |
| `Lending` | 1152092 |
| `RoleAdminManager` | 719736 |

The most expensive runtime method in the core proof path is `ComplianceVerifier.verifyProofAndSetCompliance`, with average gas of 310411. This is expected because it performs public signal checks and calls the generated pairing-based verifier. The loan lifecycle methods are cheaper than proof verification, with approval averaging 81464 gas and repayment averaging 57219 gas.

### 5.6 Circuit Size

The circuit-size inspection reports:

| Metric | Value |
| --- | ---: |
| Curve | bn-128 |
| Wires | 4198 |
| Constraints | 4196 |
| Private inputs | 4 |
| Public inputs | 4 |
| Public outputs | 0 |

The circuit is intentionally small because it proves only one LTV rule. Adding more compliance rules would likely increase circuit size, setup complexity, proof generation time, and verifier maintenance overhead.

### 5.7 Frontend Build Size

The final frontend production build snapshot is:

| Asset | Size | Gzip |
| --- | ---: | ---: |
| `dist/index.html` | 0.40 kB | 0.26 kB |
| `dist/assets/index-BFtmxQu3.css` | 64.46 kB | 12.05 kB |
| `dist/assets/ccip-B5I7aiLd.js` | 3.04 kB | 1.39 kB |
| `dist/assets/index-DrKouoma.js` | 631.18 kB | 189.69 kB |

`du -sh frontend/dist` reports `2.5M`.

### 5.8 Local End-to-End Demonstration

The local CLI demo completes the full workflow:

```text
oracle verification
-> compliance proof generation
-> on-chain verification
-> loan request
-> loan officer approval
-> repayment
```

Final local demo evidence:

| Scenario | Command | Duration | Final state |
| --- | --- | ---: | --- |
| Happy path | `pnpm demo:flow PROP-001 750000` | 1.82s | `Repaid` |

This duration includes oracle verification, compliance proof generation, on-chain proof verification, loan request, approval, and repayment on the local Hardhat chain.

![DApp final repaid loan state](../docs/demo/screenshots/06-repayment-repaid.png)

*Figure 6. DApp evidence for the completed local workflow. The loan state is `Repaid`, proof binding remains matched, and the active collateral lock has been released.*

### 5.9 Evaluation Interpretation

The evaluation supports three conclusions.

First, the implementation is functionally complete within the declared prototype scope. The full local workflow can be executed, and the test suites cover the core success and failure paths.

Second, proof generation is the main latency cost. The median proof-generation time is 547.53 ms, while the median oracle `/compliance` latency is 555.20 ms. This indicates that optimizing proof generation would have greater impact than optimizing ordinary API request handling.

Third, on-chain verification is practical for the prototype but non-negligible. The verifier call is more expensive than simple loan lifecycle state updates. This supports the architectural choice to prove a narrow rule rather than aggregating many policies into one larger circuit.

The evaluation does not claim production throughput. It measures repeated local execution for a thesis prototype with one oracle process, a mock registry, and a local Hardhat chain.

## 6. Security and Privacy Analysis

### 6.1 Security Claim

The bounded security claim is:

```text
If the oracle writes a correct property verification record and the Groth16 verifier corresponds to the implemented LTV circuit, then Lending approves only a property/principal commitment pair that has passed the 80 percent LTV proof and current on-chain binding checks.
```

This claim is deliberately limited and conditional. It does not claim production-grade lending security, full borrower privacy, decentralized oracle trust, or real asset safety.

### 6.2 Protected Assets

The protected assets are:

- property valuation;
- loan principal;
- valuation salt;
- principal salt;
- witness material;
- compliance state integrity;
- property ownership binding;
- active loan lock;
- role permissions;
- oracle private key;
- RPC and deployment secrets.

The chain receives:

- property key;
- valuation commitment;
- principal commitment;
- proof hash;
- public proof signals;
- owner address;
- verification state;
- compliance state;
- loan lifecycle state.

The chain does not receive plaintext property valuation, plaintext loan principal, salts, or witness files.

### 6.3 Threat Model

The attacker may:

- call public contract methods directly;
- call oracle API endpoints with malformed inputs;
- submit proof calldata for a different property;
- submit proof calldata for a different principal commitment;
- tamper with public signals;
- attempt to reuse stale compliance after property verification changes;
- attempt duplicate active borrowing against one property;
- act from a wallet without the required role;
- act as a malicious or mistaken loan officer;
- exploit stale frontend configuration.

The attacker is not assumed to break Ethereum execution, break Groth16 soundness under valid setup assumptions, compromise the trusted oracle machine, or compromise private keys outside the application model.

### 6.4 Implemented Mitigations

| Threat | Mitigation |
| --- | --- |
| Unauthorized property verification | `setVerified` requires `ORACLE_ROLE` |
| Unauthorized compliance write | `setCompliant` requires `COMPLIANCE_ROLE` |
| Public signal mismatch | `ComplianceVerifier` checks all four public signals |
| Tampered proof | Generated verifier must return true |
| Proof for wrong property | Property field and valuation commitment must match on-chain state |
| Proof for wrong principal | Principal commitment must match submitted loan commitment |
| Stale compliance after property refresh | `setVerified` clears compliance and principal binding |
| Duplicate active borrowing | `Lending` enforces one active loan per property |
| Unauthorized loan approval | Approval/rejection requires `LOAN_OFFICER_ROLE` |
| Unauthorized cancellation or repayment | Borrower-only checks |
| Admin lockout | `RoleAdminManager` prevents removing final admin |
| Malformed API input | Oracle validates network, property ID, and principal |

### 6.5 Privacy Boundary

ProofEstate provides on-chain privacy for valuation and principal with respect to public-chain observers. It does not provide complete transaction privacy. Owner address, property key, proof hash, compliance status, and loan state remain visible. The oracle sees plaintext values during proof generation.

The system therefore demonstrates privacy-preserving compliance, not anonymous lending.

### 6.6 Replay and Freshness Analysis

The proof is bound to four public values: the property key mapped into the SNARK field, the current on-chain valuation commitment, the submitted principal commitment, and the fixed maximum LTV threshold. `ComplianceVerifier` checks these public signals before calling the generated Groth16 verifier. This prevents a proof generated for one property, valuation commitment, principal commitment, or LTV threshold from being accepted for a different on-chain context.

The design also handles stale property verification records. When `PropertyVerification.setVerified` refreshes a property record, it clears the existing compliance flag and principal commitment. A later loan approval must therefore rely on compliance generated against the current valuation commitment.

The proof is not currently bound to a borrower address, loan ID, timestamp, expiry, or single-use nonce. As a result, the same valid proof can be resubmitted for the same property and principal commitment. In the prototype this only refreshes the same compliance state and does not bypass the lending contract's property-owner and active-loan checks. In a production system, proof freshness should be enforced through a nonce, expiry, registry version, borrower binding, or loan-specific challenge.

### 6.7 Residual Risks

The main residual risks are:

- centralized oracle trust;
- mock registry data;
- prototype trusted setup;
- no proof freshness nonce, expiry, borrower binding, or loan ID binding;
- deterministic valuation salt linkability;
- public owner address and loan state;
- no production key management;
- no real disbursement or repayment accounting;
- no liquidation or delinquency logic;
- no production monitoring or incident response.

These risks are explicit limitations of the thesis prototype. They would need to be addressed before production use.

## 7. Architecture Comparison and Generalization

### 7.1 Comparison Summary

| Architecture | Privacy for valuation/principal | On-chain enforcement | Main trust assumption | Prototype suitability |
| --- | --- | --- | --- | --- |
| Plaintext on-chain verification | None | Strong | Smart contract correctness | Poor, because it fails the privacy goal |
| Off-chain-only verification | High if backend is trusted | Weak | Backend operator | Poor, because enforcement is not on chain |
| ProofEstate Groth16 design | High against public-chain observers | Strong | Centralized oracle and setup assumptions | Strong |
| PLONK-style ZK | High against public-chain observers | Strong | Universal or updatable setup model | Medium |
| STARK-style ZK | High against public-chain observers | Strong | Hash assumptions, larger verifier/proof trade-offs | Lower for this prototype |
| Threshold oracle | Depends on proof design | Strong if integrated | Honest threshold | Future production extension |

### 7.2 Plaintext On-Chain Verification

Plaintext verification would be the simplest design. The contract could directly check the LTV formula if valuation and principal were submitted as public inputs. This design is efficient, but it fails the main privacy objective.

### 7.3 Off-Chain-Only Verification

An off-chain backend could keep data private and avoid gas costs. However, it would require participants to trust backend application logic and database state. It would not demonstrate independent smart-contract enforcement of private compliance.

### 7.4 Groth16

Groth16 is appropriate for ProofEstate because the circuit is fixed, proof size is small, and verification is practical on EVM. The cost is circuit-specific setup. For a thesis prototype, this is acceptable when documented explicitly.

### 7.5 PLONK and STARK Alternatives

PLONK-style systems are attractive when circuits change frequently or when universal setup is preferred [8]. STARK-style systems avoid trusted setup and provide transparency, but proof size and EVM verifier cost can be higher [9]. These systems are valuable future-work candidates, but they would add implementation complexity beyond the prototype's core research question.

### 7.6 Oracle Alternatives

A threshold oracle would reduce trust in one oracle service, but would require committee management, signer coordination, aggregation, monitoring, and dispute handling. An on-chain registry would improve auditability, but it would either expose values or require its own commitment and attestation design.

The current centralized oracle is therefore a deliberate research trade-off: it keeps the project reproducible while making the trust boundary explicit.

### 7.7 Generalization

ProofEstate generalizes to a broader privacy-preserving compliance pattern:

```text
private facts
-> trusted or attested source
-> commitment
-> zero-knowledge policy proof
-> on-chain or auditable verification
-> application state transition
```

Potential applications include:

- income threshold verification;
- KYC or eligibility checks;
- accredited-investor proofs;
- insurance claim verification;
- asset-backed lending;
- private marketplace compliance.

Each application would require a credible data source, a policy-specific circuit, proof freshness, and production-grade operational controls.

## 8. Limitations and Future Work

### 8.1 Limitations

ProofEstate has the following limitations:

- property records are mock JSON records;
- the oracle is centralized;
- Groth16 setup artifacts are prototype-grade;
- proof freshness is not enforced;
- valuation salt is deterministic for reproducibility;
- owner address and loan lifecycle state are public;
- no KYC/AML/DID layer is implemented;
- no real ETH/ERC20 disbursement is implemented;
- repayment is a state transition only;
- no liquidation or delinquency logic is implemented;
- no production monitoring or incident response exists;
- Sepolia support is optional validation, not final benchmark evidence.

### 8.2 Future Work

The most important future extensions are:

1. signed registry attestations;
2. threshold oracle verification;
3. proof freshness using nonce, expiry, registry version, or loan-specific challenge;
4. additional compliance rules;
5. alternative proof systems;
6. production identity and credential verification;
7. real disbursement and repayment accounting;
8. liquidation and risk management;
9. monitoring, indexing, alerting, and incident response.

### 8.3 Production Hardening

A production system would require changes beyond implementation refinement. The oracle trust model would need to be replaced or reduced through signed source attestations, threshold validation, or credential-based proofs. Key management would need hardware-backed custody or equivalent operational controls. Proof freshness would need explicit binding to a nonce, expiry, registry version, borrower identity, or loan identifier. The lending contract would need real asset accounting, payment flows, liquidation rules, and re-entrancy protections if external transfers were introduced. Monitoring, indexing, alerting, incident response, and independent security review would be necessary before handling real assets.

## 9. Conclusion

ProofEstate demonstrates that a sensitive lending compliance rule can be proven privately and enforced on chain. The implemented system proves that a requested principal is at most 80 percent of a property valuation without publishing either plaintext value on chain. It binds proof public signals to property state and principal commitments, and then uses that compliance state to control a role-gated loan lifecycle.

The evaluation shows that the system is reproducible locally and functionally complete within its scoped prototype. The system passes contract, oracle, frontend, build, gas, and demo checks. The final benchmark shows median Groth16 proof generation time of 547.53 ms, median oracle `/compliance` latency of 555.20 ms, and average on-chain proof verification gas of 310411. These results support the conclusion that proof generation is the dominant latency cost and that on-chain verification is practical for a narrow prototype rule.

The project remains bounded by important limitations: centralized oracle trust, mock registry data, prototype setup artifacts, no proof freshness, and no real lending settlement. Within those boundaries, ProofEstate provides a coherent demonstration of how commitments, zero-knowledge proofs, and smart contracts can be combined to preserve privacy while maintaining auditable compliance enforcement.

## Appendix A: Key Reproduction Commands

Compile and test:

```bash
nvm use
pnpm compile
pnpm test:all
pnpm test:gas
```

Run the local demo:

```bash
pnpm chain:local
pnpm demo:deploy
pnpm oracle:api
pnpm demo:ready
pnpm demo:flow PROP-001 750000
```

Run the final local benchmark command:

```bash
pnpm benchmark:local --warmups=5 --runs=30 --property=PROP-001 --principal=750000 --api=http://127.0.0.1:8787
```

## Appendix B: Evidence Documents

| Document | Purpose |
| --- | --- |
| `docs/evaluation-notes.md` | Final functional and environment evidence |
| `docs/benchmarks/final-benchmarks.md` | Final benchmark summary |
| `docs/benchmarks/raw/local-2026-08-03T14-49-27-759Z.json` | Final raw benchmark data |
| `docs/smart-contract-interface-spec.md` | Contract interface specification |
| `docs/zk-proof-design.md` | ZK proof design |
| `docs/security-evaluation-report.md` | Security evaluation |
| `docs/architecture-comparison.md` | Architecture comparison |
| `docs/limitations-and-extensions.md` | Limitations and future work |
| `docs/demo/demo-checklist.md` | Defense demo checklist |
| `docs/demo/screenshots/README.md` | Local DApp screenshot evidence index |

## Appendix C: DApp Demonstration Screenshots

The DApp screenshots were captured against the local Hardhat and oracle workflow. They serve as visual evidence for the browser-based demonstration path and complement the CLI, test, benchmark, and gas evidence reported in Section 5. Any plaintext values visible in these screenshots are local mock demonstration values, not plaintext values stored by the contracts.

| Screenshot | Evidence shown |
| --- | --- |
| `docs/demo/screenshots/01-wallet-readiness.png` | Wallet connected on localhost, local RPC ready, oracle API ready, contracts deployed, and wallet network matched |
| `docs/demo/screenshots/02-property-verified-onchain-record.png` | `PROP-001` verification completed with on-chain record, verified status, and valuation commitment |
| `docs/demo/screenshots/03-compliance-proof-success.png` | ZK compliance proof completed for principal `750000`, LTV below the maximum borrow amount, and proof binding matched |
| `docs/demo/screenshots/04-loan-requested.png` | Borrower loan request submitted, state `Requested`, proof binding matched, and collateral lock active |
| `docs/demo/screenshots/05-loan-officer-approval.png` | Loan officer approval completed, state `Approved`, proof binding matched, and approval timestamp recorded |
| `docs/demo/screenshots/06-repayment-repaid.png` | Borrower repayment completed, state `Repaid`, repayment timestamp recorded, and collateral lock released |
| `docs/demo/screenshots/07-admin-role-access-management.png` | Admin role management, role directory, grant/revoke controls, role records, and admin readiness |
| `docs/demo/screenshots/08-contract-readiness-settings.png` | Contract and network operations view showing service metrics, contract coverage, local RPC readiness, and oracle service readiness |
| `docs/demo/screenshots/09-event-audit-log.png` | Audit log showing loan ledger, on-chain event log, proof/asset coverage, permission changes, and final `Repaid` state |

## References

[1] G. Wood, "Ethereum: A Secure Decentralised Generalised Transaction Ledger," Ethereum Yellow Paper. Available at: https://github.com/ethereum/yellowpaper

[2] V. Buterin, "Ethereum Whitepaper: A Next-Generation Smart Contract and Decentralized Application Platform," 2014. Available at: https://ethereum.org/whitepaper/

[3] OpenZeppelin, "Access Control," OpenZeppelin Contracts Documentation. Available at: https://docs.openzeppelin.com/contracts/4.x/access-control

[4] J. Groth, "On the Size of Pairing-Based Non-interactive Arguments," EUROCRYPT 2016, LNCS 9666, pp. 305-326, 2016. DOI: 10.1007/978-3-662-49896-5_11.

[5] M. R. Albrecht, L. Grassi, C. Rechberger, A. Roy, and T. Tiessen, "MiMC: Efficient Encryption and Cryptographic Hashing with Minimal Multiplicative Complexity," ASIACRYPT 2016, pp. 191-219, 2016. DOI: 10.1007/978-3-662-53887-6_7.

[6] iden3, "Circom 2 Documentation." Available at: https://docs.circom.io/

[7] iden3, "snarkjs: zkSNARK implementation in JavaScript and WASM." Available at: https://github.com/iden3/snarkjs

[8] A. Gabizon, Z. J. Williamson, and O. Ciobotaru, "PLONK: Permutations over Lagrange-bases for Oecumenical Noninteractive arguments of Knowledge," IACR Cryptology ePrint Archive, Report 2019/953, 2019. Available at: https://eprint.iacr.org/2019/953

[9] E. Ben-Sasson, I. Bentov, Y. Horesh, and M. Riabzev, "Scalable, transparent, and post-quantum secure computational integrity," IACR Cryptology ePrint Archive, Report 2018/046, 2018. Available at: https://eprint.iacr.org/2018/046

[10] Compound Finance, "Compound Protocol." Available at: https://github.com/compound-finance/compound-protocol

[11] Aave, "Introduction to Aave V3." Available at: https://aave.com/help/aave-101/introduction-to-aave

[12] Chainlink, "Chainlink 2.0 and the future of Decentralized Oracle Networks." Available at: https://chain.link/whitepaper
