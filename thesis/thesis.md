# ProofEstate: Blockchain-Based Real Estate Lending Platform with ZK Compliance and Property Verification

## Abstract

Public blockchains make lending decisions auditable, but direct verification of a loan-to-value (LTV) rule exposes financial inputs. A valid zero-knowledge proof must also be bound to the property record and requested principal before it can authorize the intended lending decision. This thesis investigates that application-security problem through ProofEstate, an implemented real-estate lending prototype.

ProofEstate combines a mock registry, trusted oracle, MiMC commitments, Groth16 proof, Solidity contracts, and React application. The circuit proves that a committed principal does not exceed 80% of a committed valuation. Before writing compliance, the verifier checks the property field identifier, current valuation commitment, principal commitment, and fixed threshold. Loan approval requires current verification and compliance matching the request. Ownership is checked when a loan is requested; approval and later refreshes have distinct boundaries.

Evaluation combines archived September 2026 measurements with nine additional security and arithmetic regression tests. The resulting contract suite has 37 passing tests; archived evidence includes 12 oracle API tests, six frontend component tests, circuit and gas inspection, a complete local workflow, four input scenarios, and sequential 10/30/50-run timing sessions. The primary 30-run session reports median proof generation of 399.53 ms and a median read-only compliance response of 409.16 ms, excluding blockchain transactions. Archived proof verification and compliance update average 310,411 gas. Added tests verify substitution and threshold rejection, integer boundaries, and accepted replay, ownership-change, compliance-replacement, and post-approval behaviors.

The contribution is a concrete proof-to-state binding pattern and conditional approval argument, supported by reproducible local observations. The prototype omits valuation and principal plaintext from the blockchain, while its mock registry and unauthenticated API expose values and salts. Deterministic valuation blinding does not establish strong hiding. Proof freshness, approval-time ownership revalidation, continuous collateral monitoring, real settlement, and production performance remain open requirements. No comparative speedup or application-wide confidentiality is established.

**Keywords:** zero-knowledge proofs, smart contracts, real-estate lending, privacy-preserving compliance, Groth16, oracle, commitments

## 1. Introduction

### 1.1 Motivation

Blockchain systems are attractive for workflows that require transparent state transitions, programmable enforcement, and auditable records. Ethereum-style smart contracts can encode rules, restrict functions to authorized roles, emit events, and preserve application state in a form that can be independently inspected [1], [2]. These properties are relevant to lending because property verification, loan approval, collateral state, repayment state, and administrative actions should be reliable, traceable, and resistant to unilateral modification.

The same transparency creates a privacy problem. Contract calldata, logs, and storage can be inspected by external observers. In real-estate lending, sensitive information can include property valuation, requested principal, borrower identity, ownership history, income evidence, and lender-specific risk decisions. A plaintext contract design could verify a loan-to-value (LTV) rule by accepting valuation and principal values directly, but that design would permanently reveal the financial facts used in the decision.

Zero-knowledge proofs provide a mechanism for separating validity from disclosure. A prover can demonstrate that private witness values satisfy a public statement without revealing those witness values. For a lending rule, this means a system can prove that a requested principal is within a maximum LTV threshold while keeping both the property valuation and the requested principal off chain.

ProofEstate explores this design through a concrete end-to-end prototype. It does not attempt to implement a full mortgage system or decentralized finance lending market. Instead, it focuses on a narrower research objective: enabling private off-chain property and loan values to influence public smart-contract state through commitments, proof verification, and explicit application-level binding checks.

### 1.2 Research Question

The main research question is:

*Can a real-estate lending workflow enforce an LTV rule on chain without publishing plaintext property valuation or requested loan principal?*

The question is decomposed into five design and evaluation subquestions:

1. How can off-chain property facts be represented on chain without publishing plaintext valuation data?
2. How can a zero-knowledge proof be bound to a specific property and requested principal commitment?
3. How can approval require current, property- and principal-bound compliance, and what proof freshness is enforced?
4. What are the proof-generation, API-latency, circuit-size, and gas costs of the design in a reproducible local environment?
5. What trust assumptions remain after introducing zero-knowledge proofs?

### 1.3 Contributions

This thesis makes the following contributions:

1. An end-to-end architecture for privacy-preserving real-estate lending verification, combining a trusted oracle service, MiMC commitments, Groth16 proof generation, Solidity contracts, and a React DApp.
2. A concrete zero-knowledge LTV statement with four public inputs, four private inputs, property-bound commitments, range checks, and an inclusive 80 percent policy threshold.
3. An application-level binding design that connects proof public signals to current on-chain property state and principal commitments before a loan can be approved.
4. A reproducible evaluation package covering contract tests, oracle API tests, frontend tests, gas measurements, proof-generation benchmarks, circuit-size inspection, frontend build output, and local end-to-end workflow evidence.
5. A comparative analysis of plaintext on-chain verification, off-chain-only verification, the selected Groth16 design, alternative proof systems, and alternative oracle models.
6. A bounded security and privacy analysis that separates the implemented guarantees from remaining trust assumptions, residual risks, limitations, and production-hardening requirements.

### 1.4 Scope and Non-Goals

The implemented compliance rule is:

```text
loanPrincipal * 10000 <= propertyValue * 8000
```

This is equivalent to proving:

```text
loanPrincipal <= 80 percent of propertyValue
```

The rule is an illustrative application policy, not an assertion that 80% is the legally applicable LTV limit for a particular jurisdiction, borrower, or loan product. A single policy can be specified, implemented, tested, benchmarked, and explained rigorously. ProofEstate does not implement real disbursement, fiat settlement, ETH/ERC20 transfers, KYC/AML, credit scoring, liquidation, delinquency handling, production registry integration, production monitoring, or decentralized oracle governance. These omissions define the boundary of the research prototype.

### 1.5 Thesis Organization

Chapter 2 reviews background and related work. Chapters 3 and 4 present design and implementation. Chapter 5 evaluates the prototype, and Chapter 6 analyzes security and privacy. Chapter 7 answers the research subquestions and discusses design trade-offs. Chapters 8 and 9 present limitations, future work, and conclusions. References and reproduction appendices follow.

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

A commitment can bind a value, with hiding dependent on its construction and secret randomness. ProofEstate uses hash-based commitments to refer to valuation and principal without directly publishing them in contract storage. The circuit computes:

```text
valuationCommitment = MiMC(propertyKeyField, propertyValue, valuationSalt)
principalCommitment = MiMC(propertyKeyField, loanPrincipal, principalSalt)
```

MiMC is selected because it is designed for low multiplicative complexity and is efficient in arithmetic-circuit settings [5]. Ethereum-native hashes such as Keccak are natural on chain, but expensive inside Circom-style arithmetic circuits. Including `propertyKeyField` in both commitments binds the hidden values to a property context and reduces straightforward replay across unrelated properties.

### 2.5 Zero-Knowledge Proofs

A zero-knowledge proof allows a prover to convince a verifier that a statement is true without revealing the private witness. ProofEstate uses Groth16, a succinct non-interactive argument system whose compact proofs and practical verifier cost make it widely used in blockchain applications [4].

Groth16's main trade-off is trusted setup. It requires proving and verification artifacts tied to a specific circuit. In ProofEstate, these artifacts are prototype-grade and suitable for local reproducibility and research evaluation. A production system would need a documented trusted setup ceremony or a proof system with different setup assumptions. The circuit is written in Circom and proof generation is performed with snarkjs [6], [7].

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

Decentralized lending protocols such as Compound and Aave demonstrate how smart contracts can manage collateralized borrowing, interest, liquidity pools, and repayment state [10], [11]. These protocols primarily operate with crypto-native assets and public on-chain collateral values. Broader DeFi analysis also emphasizes transparency, composability, and the use of smart contracts to recreate financial-market functions without traditional intermediaries [13]. ProofEstate differs by focusing on real-estate-style collateral, where relevant facts originate off chain and may be private.

Oracle systems such as Chainlink and related decentralized oracle designs illustrate how external data and off-chain computation can be connected to on-chain applications [12]. Research systems such as Town Crier and DECO further show that authenticated data feeds, trusted execution, TLS provenance, and zero-knowledge statements can be used to bridge web data into smart-contract settings [14], [15]. ProofEstate uses a simpler centralized oracle to keep the prototype reproducible. This choice is not production-grade, but it isolates the research contribution from the separate problem of oracle decentralization.

Zero-knowledge proof systems differ in setup assumptions, proof size, prover time, verifier time, and implementation maturity. Groth16 provides compact proofs and efficient verification but requires circuit-specific setup [4]. PLONK-style systems can support universal or updatable setup, making them attractive for applications with evolving circuits [8]. STARK-style systems avoid trusted setup and provide transparency, but proof size and EVM verification cost can be higher [9].

Zerocash shows how zk-SNARKs can hide transaction metadata in a ledger-based currency, while Hawk studies privacy-preserving smart contracts more generally [16], [17]. ProofEstate does not attempt to provide full payment anonymity or a general private-contract compiler. Instead, it uses the same broad principle of selective disclosure for a narrower compliance problem: proving that a lending policy is satisfied without publishing the underlying valuation and principal.

ProofEstate belongs to the broader category of selective-disclosure compliance systems: applications that prove a user, asset, or transaction satisfies a policy without including all underlying data in the proof statement. Similar patterns can apply to income verification, identity eligibility, insurance claims, and asset-backed lending. ProofEstate omits plaintext valuation and principal from blockchain transactions and storage, while publishing the property key, owner address, commitments, compliance state, proof hash, and loan lifecycle. This is a data-publication boundary; confidentiality against an observer who can also access the prototype registry or API is not established.

### 2.8 Research Gap and Positioning

The application question examined here is how a proof of a private lending predicate is connected to the exact public state that authorizes approval. The cited DeFi protocols, oracle systems, and private-contract systems provide relevant foundations, but are not matched experimental baselines. This review is a focused architectural comparison, not a systematic literature review or evidence that state binding has never been used elsewhere. Originality is claimed for the concrete integration, explicit statement and trust boundaries, and reproducible evaluation of this prototype.

ProofEstate is positioned at the intersection of these areas. Its contribution is not a new proof system, a decentralized oracle network, or a production lending market. Instead, it gives a concrete, reproducible architecture for a narrower question: how an off-chain real-estate fact can be committed, proven against a fixed LTV policy, checked against current on-chain state, and used to drive a loan lifecycle without publishing the underlying valuation or requested principal.

The following table summarizes the positioning:

*Table 1. Architectural context and the focus of this prototype.*

| Area | What existing work provides | Remaining gap addressed by ProofEstate |
| --- | --- | --- |
| DeFi lending | On-chain collateral accounting, loan lifecycle logic, public state transitions | Private off-chain collateral facts and property-specific compliance binding |
| Oracles | External data delivery, authenticated feeds, decentralized or attested data-source designs | End-to-end integration of oracle-written commitments with ZK policy proofs and lending approval |
| ZK payments and private smart contracts | Stronger privacy models and general private computation patterns | A narrow, auditable compliance workflow that is small enough to implement, test, and benchmark |
| Smart-contract access control | Role separation and administrative permissions | Role-gated lending workflow tied to proof-bound property compliance |

## 3. System Design

### 3.1 Design Requirements

ProofEstate is designed around five requirements:

1. The property valuation and requested principal must not be stored in plaintext on chain.
2. The on-chain verifier must reject proofs whose public signals do not match the target property and requested principal commitment.
3. Approval must require current verification and compliance matching the requested principal commitment. Refreshing verification must clear the stored compliance decision.
4. The prototype must be reproducible in a local environment without depending on public testnet availability.
5. The remaining trust assumptions must be explicit rather than hidden behind the zero-knowledge proof.

These requirements shape the architecture. The oracle handles off-chain registry interpretation and proof generation. Commitments represent private values on chain. The zero-knowledge proof verifies policy satisfaction. Smart contracts bind proof outputs to application state and enforce the loan lifecycle.

### 3.2 Architecture Overview

ProofEstate links off-chain facts to on-chain verification and enforcement (Figure 1).

The components are a React DApp, Node.js oracle API, mock property registry, Circom/snarkjs Groth16 prover, Solidity verification/compliance/lending/role contracts, and a local Hardhat chain for reproduction and evaluation.

The flow moves from registry lookup and oracle verification to commitment and proof generation, on-chain verification, loan request and decision, and repayment or closure.

### 3.3 Actors

The main actors are:

*Table 2. Operational actors.*

| Actor | Responsibility |
| --- | --- |
| Property owner / borrower | Initiates verification, compliance proof generation, loan request, cancellation, and repayment |
| Oracle service | Reads registry data, computes commitments, generates proofs, and writes verification/compliance transactions |
| Loan officer | Approves or rejects requested loans |
| Protocol admin | Manages protocol administration roles |
| Auditor / evaluator | Reviews contract state, events, benchmark results, screenshots, and documentation |

![System architecture](../docs/figures/01-system-architecture.png){width=6.2in}

*Figure 1. ProofEstate architecture and the registry, oracle/prover, client, and contract boundaries. The API handles plaintext witness data; the on-chain layer receives commitments, proofs, and public signals.*

### 3.4 Workflow

![End-to-end data flow](../docs/figures/05-end-to-end-data-flow.png){width=6.2in}

*Figure 2. End-to-end data and control flow from registry verification and proving to borrower requests and loan-officer decisions. Ownership is checked at request time; verification and matching compliance are checked at approval.*

The workflow in Figure 2 proceeds as follows:

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
12. `Lending.requestLoan` checks the recorded owner, a nonzero principal commitment, and the active-loan lock; verification and compliance are checked later.
13. A loan officer approves or rejects the loan. Approval checks the current verification flag and matching compliance commitment, but does not recheck the owner.
14. The borrower marks the approved loan as repaid, releasing the active collateral lock; no funds are transferred.

### 3.5 Data Visibility Boundary

The chain receives property identifiers, ownership, commitments, proof evidence, and lifecycle state; valuation, principal, salts, and witness files remain off chain. This separates publication at the contract interface from confidentiality of the application.

The oracle handles plaintext inputs, and the mock registry and unauthenticated API expose financial values and proof inputs. Deterministic valuation blinding also permits candidate testing. Section 6.6 analyzes these disclosure boundaries.

### 3.6 Design Invariants

Five invariants bind the proved LTV predicate to the intended property state and loan request:

*Table 3. Contract and application invariants.*

| Invariant | Enforcement point |
| --- | --- |
| Plaintext valuation and principal are not written to contract storage | Commitments are stored; witness values remain off chain |
| A proof must match the current property and principal context | `ComplianceVerifier` checks all public signals before calling the generated verifier |
| A refreshed property verification clears the stored compliance decision | `PropertyVerification.setVerified` resets compliance and principal binding; this does not make an unchanged proof single-use |
| Loan approval requires proof-bound compliance for the same principal commitment | `Lending.approveLoan` calls `isCompliantFor(propertyId, principalCommitment)` |
| Contract authorization does not depend on the frontend | Contracts enforce roles and state; API input validation does not authenticate the user or authorize use of the oracle signer |

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

The `contracts/` folder contains Solidity contracts and the generated Groth16 verifier. The `backend/oracle/` folder contains the oracle API and property-verification logic. The `circuits/` and `zk/` folders contain the Circom circuit, ZK build outputs, and proof-generation helpers. The `frontend/` folder contains the React DApp. The `scripts/` folder contains deployment, synchronization, local workflow, ZK build, and benchmark scripts. The `docs/` folder contains design, benchmark, security, deployment, and screenshot evidence.

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

`setVerified` requires `ORACLE_ROLE`. Every refresh clears the stored compliance flag, proof hash, and principal commitment. A proof bound to a different valuation commitment then fails the binding check. If the valuation commitment remains unchanged, the same previously valid proof can be submitted again. Clearing application state therefore does not establish cryptographic freshness.

`setCompliant` requires `COMPLIANCE_ROLE`. In deployment, that role is granted to `ComplianceVerifier`, preventing arbitrary accounts from writing compliance state directly.

#### ComplianceVerifier

`ComplianceVerifier` is the bridge between application state and the generated Groth16 verifier. It does not accept a proof merely because the verifier returns true. Before proof verification, it checks each public signal against the current application state:

*Table 4. Required public-signal bindings.*

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

Figure 3 summarizes the loan lifecycle. The contract enforces one active loan per property, preventing duplicate active borrowing against the same collateral within the prototype model.

![Loan state machine](../docs/figures/06-loan-state-machine.png)

*Figure 3. Loan lifecycle state machine. Requested loans may become Approved, Rejected, or Cancelled. Only Approved loans may become Repaid; repayment records a state change without asset settlement.*

Ownership is checked at request time only. A later oracle ownership update can coexist with approval of the original borrower's pending request if valid compliance is restored. Moreover, only one principal commitment is stored per property: submitting compliance for another principal replaces the previous record and can cause a pending request to be rejected. Once a loan is approved, later verification or compliance changes do not automatically alter its state. These behaviors are verified by the submission security tests and are limitations of approval as a snapshot decision.

#### RoleAdminManager

`RoleAdminManager` coordinates protocol admin grants and revocations across `PropertyVerification`, `Lending`, and itself. It prevents removal of its final manager administrator. Its inherited role methods and the managed contracts' individual role methods can still create partial administrative configurations, so the manager count is not a proof of complete administrative continuity across all contracts.

#### Generated Groth16 Verifier

`LtvGroth16Verifier` is generated from the Groth16 proving artifacts. It performs the pairing-based proof verification used by `ComplianceVerifier`. The generated verifier is treated as part of the proof-system artifact set and is tied to the current circuit.

### 4.3 Oracle Service

The oracle service performs four responsibilities:

1. It reads mock property records.
2. It evaluates deterministic property verification rules.
3. It computes commitments and proof inputs.
4. It generates and optionally submits compliance proof transactions.

The service exposes API endpoints for health checks, property listing, property verification, and compliance proof generation. It validates property IDs, network labels, and principal values before building proof inputs. Invalid requests fail explicitly rather than causing unhandled server errors.

The oracle is trusted for source correctness, witness handling, and privileged writes. Its current API returns plaintext property data and proof inputs; input validation and an owner filter do not constitute access control. Future work must address both data-source authenticity and confidential witness delivery through authenticated interfaces, restricted responses, signed registry attestations, or threshold oracle verification.

### 4.4 ZK Circuit

The circuit source is:

```text
circuits/ltv.circom
```

It proves:

```text
loanPrincipal * 10000 <= propertyValue * maxLtvBps
```

with `maxLtvBps = 8000`. Figure 4 traces proof generation and verification.

![ZK proof workflow](../docs/figures/04-zk-proof-workflow.png){width=3.25in}

*Figure 4. Zero-knowledge proof workflow showing witness construction, commitment generation, Groth16 proof generation, public-signal binding, and on-chain verification.*

The public inputs are:

*Table 5. Public circuit inputs.*

| Input | Meaning |
| --- | --- |
| `propertyKeyField` | property ID mapped into the SNARK scalar field |
| `valuationCommitment` | commitment to property valuation |
| `principalCommitment` | commitment to requested principal |
| `maxLtvBps` | maximum LTV threshold in basis points |

The private inputs are:

*Table 6. Private circuit inputs.*

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

The React DApp supports the end-to-end inspection workflow. It includes:

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

The DApp improves usability and observability, but it does not replace contract validation. The contracts and oracle API remain responsible for enforcing security-critical checks. Figures 5 and 6 use local mock values for evaluation visibility; they do not show plaintext valuation or principal stored on chain.

![DApp compliance proof workspace](../docs/screenshots/03-zk-compliance-proof-verified.png)

*Figure 5. DApp compliance proof workspace after successful proof generation for `PROP-001` and principal `750000`. The view shows the calculated LTV, maximum borrow amount, principal commitment, proof verification status, and matched proof binding.*

### 4.6 Reproducibility Artifacts

The implementation is accompanied by contract and circuit specifications, automated tests, local deployment and workflow scripts, raw benchmark JSON, and DApp screenshot evidence. Appendix A gives the reproduction commands; Appendix B maps the supporting documents to their purposes. The evaluation identifies the archived environment and working-tree status separately from later regression checks, so evidence from different executions is not treated as one experiment.

## 5. Evaluation

### 5.1 Evaluation Questions and Metrics

The evaluation is organized around six questions that correspond to the research question and design requirements:

*Table 7. Evaluation questions and evidence.*

| ID | Evaluation question | Evidence used |
| --- | --- | --- |
| EQ1 | Does the implementation enforce the intended role and state-transition rules? | Contract tests, role tests, loan lifecycle tests |
| EQ2 | Does the ZK proof bind to the intended property, valuation commitment, principal commitment, and LTV threshold? | Circuit design, proof-verifier tests, public-signal mismatch tests |
| EQ3 | Does the local workflow complete end to end without publishing plaintext valuation or principal on chain? | Local CLI workflow, DApp screenshots, contract state inspection |
| EQ4 | Do boundary and failure cases behave correctly? | Correctness matrix for compliant, boundary, non-compliant, and invalid-registry cases |
| EQ5 | What are the main local performance costs of the successful proof-generation path? | 30-run benchmark, 10/30/50 repeated-run stability snapshot, gas snapshot, circuit-size inspection |
| EQ6 | What assumptions and residual risks remain after introducing zero-knowledge proofs? | Security analysis, threat model, limitations, hosted Oracle API analysis |

The measured metrics are selected to match the prototype's security and performance claims rather than to estimate production throughput.

*Table 8. Metrics and their interpretation.*

| Metric category | Metric | Interpretation |
| --- | --- | --- |
| Functional correctness | Passing contract, oracle, and frontend tests | Whether implementation behavior matches intended role, proof, API, and UI assumptions |
| Boundary correctness | Compliant, exact-boundary, non-compliant, and invalid-registry cases | Whether the policy accepts and rejects the intended input classes |
| Proof performance | Groth16 proof-generation latency | Main off-chain cryptographic cost of the compliance path |
| API performance | `/verify` and `/compliance` latency | End-user visible oracle-service latency in the local path |
| On-chain cost | Gas for verification, compliance, and loan lifecycle methods | Cost distribution across proof verification and ordinary lending state transitions |
| Circuit complexity | Wires, constraints, public/private inputs | Size of the implemented proof statement and likely direction of scaling pressure |
| Reproducibility | Raw benchmark JSON, command, environment, git commit, dirty flag | Whether another evaluator can inspect and rerun the evidence path |

### 5.2 Experimental Setup and Measurement Method

The evaluation is local-first. This choice is deliberate: local execution is reproducible, independent of public RPC availability, and suitable for consistent proof-generation, API-latency, and gas measurements. The results should therefore be interpreted as controlled prototype measurements, not public-network throughput claims.

The experiment matrix covers a below-limit principal, the exact LTV boundary, a principal one unit above the boundary, and an invalid registry record. The primary and boundary sessions each exclude five warm-ups and retain 30 measured iterations. Additional sequential sessions retain 10 and 50 iterations to examine variation across bounded repeated workloads; the primary 30-run session supplies the middle comparison. Appendix A provides the exact commands, and Appendix B identifies the summary and raw evidence files.

Warm-up iterations are excluded from summary statistics. Each iteration sequentially times input construction, a direct proof-generation invocation, and separate API requests. The API calls use `write: false`; neither API timing includes submission, transaction inclusion, or confirmation. The `/compliance` request generates its own proof, so its timing is not the enclosing duration of the separately timed direct proof. Differences between their medians cannot estimate API overhead. Sepolia transaction latency is excluded.

The benchmark uses the nearest-rank quantile definition: the reported 50th percentile is sorted observation `ceil(0.50*n)` and P95 is observation `ceil(0.95*n)`. For even sample counts, the reported “median” is therefore the lower central observation, rather than the mean of the two central observations. Standard deviation uses denominator `n`; P95 is suppressed for fewer than 20 measurements. These descriptive summaries do not provide confidence intervals or a statistical comparison between implementations.

The final benchmark environment is:

*Table 9. Archived timing environment.*

| Item | Value |
| --- | --- |
| OS | Darwin 23.1.0 x64 |
| CPU | Intel(R) Core(TM) i7-9750H CPU @ 2.60GHz |
| Node | v20.20.2 |
| pnpm | 10.9.0 |
| Hardhat | 2.28.6 |
| snarkjs | 0.7.6 |
| circom | 2.2.3 at `$HOME/.cargo/bin/circom` |
| Git commit | `5f512070cbfc8c0b40d50d2be50d6595b17f29a7` |
| Git dirty flag | `true` during manuscript/documentation updates |
| Network label | `localhost` |

### 5.3 Functional and Boundary Correctness

#### Functional checks

The archived functional evidence and the subsequent submission regression results are:

*Table 10. Archived and submission functional evidence.*

| Evidence | Result |
| --- | --- |
| Archived contract suite | 28 passing |
| Contract suite after submission security tests | 37 passing, including six security and three arithmetic boundary tests |
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

The six frontend tests cover the wallet gate and selected table/detail components. They do not exercise the complete wallet transaction lifecycle or all application pages. The frontend production build passes, with a Vite chunk-size warning that does not fail the build.

The six added tests reject a valid proof offered for another verified property and a modified threshold signal; demonstrate accepted proof resubmission after an unchanged refresh; demonstrate approval without an ownership recheck; demonstrate rejection after principal replacement; and demonstrate that an approved loan survives a later compliance reset. The final four are boundary observations, not additional production guarantees. All tests share `test/proofestate.test.js`. Three further arithmetic tests verify exact-boundary acceptance on chain and circuit rejection one unit above it, the largest 64-bit valuation and its maximum compliant principal, and valuation/principal overflow with consistently recomputed commitments. These tests bypass the API rejection path and check the circuit itself.

#### Policy scenarios and arithmetic boundaries

`PROP-001` has a mock registry valuation of `980000`. Under the 80 percent LTV rule:

```text
980000 * 8000 / 10000 = 784000
```

The benchmark matrix uses this value to test the compliant path, exact boundary, one-unit-above-boundary failure, and registry-failure path.

*Table 11. Policy scenarios and recorded proving behavior.*

| Scenario | Property | Principal | Policy expectation | Recorded proving behavior |
| --- | --- | ---: | --- | --- |
| Compliant | `PROP-001` | 750000 | Within 80% limit | Proof generated |
| Exact boundary | `PROP-001` | 784000 | Equals 80% limit | Proof generated |
| Above boundary | `PROP-001` | 784001 | Exceeds 80% limit | Proving skipped: non-compliant |
| Registry failure | `PROP-004` | 100000 | Encumbrance rule fails | Proving skipped: `NO_ENCUMBRANCE` |

Each scenario contains 30 measured iterations and no recorded timing exceptions. Valuation and principal use the same abstract integer unit; no currency conversion or floating-point monetary arithmetic is performed.

Passing scenarios generate Groth16 proofs and rejected scenarios skip proving. In the timing harness, “failures” counts caught exceptions or non-success HTTP responses; an expected policy rejection is not a timing failure. The harness does not independently assert every API response's decision or verify every generated proof on chain. Recorded skip reasons and implementation tests provide separate behavioral evidence. Registry eligibility is checked by the oracle and is not included in the LTV circuit.

### 5.4 Proof and API Performance

#### Primary compliant path

Primary compliant path: `PROP-001`, principal `750000`, 5 warm-up runs and 30 measured runs.

*Table 12. Primary sequential latency measurements in milliseconds.*

| Metric | n | Fail. | Min ms | Median ms | Mean ms | P95 ms | Max ms | Std dev |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Build verification input | 30 | 0 | 1.91 | 3.05 | 3.22 | 4.77 | 7.94 | 1.09 |
| Build compliance inputs | 30 | 0 | 3.19 | 3.73 | 4.01 | 5.31 | 6.72 | 0.79 |
| Generate Groth16 proof | 30 | 0 | 372.42 | 399.53 | 407.55 | 469.53 | 481.21 | 24.66 |
| Oracle `/verify` latency | 30 | 0 | 5.02 | 5.98 | 6.78 | 11.45 | 12.54 | 1.91 |
| Oracle `/compliance` latency | 30 | 0 | 377.61 | 409.16 | 413.27 | 480.30 | 487.67 | 22.65 |

The results show that proof generation dominates local latency. Building verification and compliance inputs is fast, with median times below 5 ms. Oracle `/verify` is also fast because it evaluates registry rules and computes commitments. Oracle `/compliance` has a median latency of 409.16 ms because it includes Groth16 proof generation.

The two reported medians are similar in scale, which is consistent with proving being the main cost of a successful read-only compliance request. It does not measure API overhead: the API and direct measurements use separate proof invocations. A paired decomposition would require timing the prover inside each API request and reporting the residual from the same invocation.

#### Boundary and rejection paths

*Table 13. Boundary and rejection-path timings.*

| Case | Metric | n | Fail. | Median ms | Mean ms | Notes |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| Boundary | Generate Groth16 proof | 30 | 0 | 437.08 | 471.37 | Proof generated at exactly 80% LTV |
| Boundary | Oracle `/compliance` latency | 30 | 0 | 432.62 | 451.57 | Includes proof generation |
| Non-compliant | Build compliance inputs | 30 | 0 | 3.24 | 3.37 | Rejects above 80% LTV |
| Non-compliant | Oracle `/compliance` latency | 30 | 0 | 5.38 | 5.54 | Proof generation skipped |
| Invalid registry | Build compliance inputs | 30 | 0 | 0.19 | 0.19 | Fails registry validation |
| Invalid registry | Oracle `/compliance` latency | 30 | 0 | 1.56 | 1.66 | Proof generation skipped |

Rejected paths are faster because the oracle does not invoke Groth16 proof generation when the LTV predicate or registry validation fails.

#### Bounded repeated-run stability

All stability runs use `PROP-001` with principal `750000` and the same local Oracle API. This is a repeated local workload, not a public-chain throughput or concurrent-user benchmark.

*Table 14. Sequential timing-session summaries.*

| Measured runs | Fail. | Median proof ms | Mean proof ms | P95 proof ms | Median `/compliance` ms | P95 `/compliance` ms |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 10 | 0 | 441.43 | 455.58 | n/a | 428.45 | n/a |
| 30 | 0 | 399.53 | 407.55 | 469.53 | 409.16 | 480.30 |
| 50 | 0 | 406.01 | 413.36 | 440.06 | 408.36 | 475.02 |

The three sequential sessions record zero timing failures and proof-generation medians between 399.53 ms and 441.43 ms. They describe consistency in these bounded local workloads, without establishing a failure-rate bound, statistical equivalence, production scalability, or concurrent-traffic capacity.

### 5.5 On-Chain Gas Costs

Gas results use the archived Node 20 Hardhat gas-reporter baseline. The reproduction command is given in Appendix A; later submission regression checks do not replace this historical workload.

*Table 15. Archived method gas averages.*

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

*Table 16. Archived deployment gas averages.*

| Contract | Average gas |
| --- | ---: |
| `PropertyVerification` | 771511 |
| `ComplianceVerifier` | 417315 |
| `LtvGroth16Verifier` | 411178 |
| `Lending` | 1152092 |
| `RoleAdminManager` | 719736 |

The archived average of 310,411 gas for `ComplianceVerifier.verifyProofAndSetCompliance` includes signal checks, the generated verifier call, state writes, and event emission. It is not an isolated pairing-verification cost. The reporter aggregates observed calls to each method: `setVerified` spans different storage states, and `approveLoan` can include approval and rejection paths. These averages are descriptive costs of the archived test workload, not a guaranteed price for every successful transaction. Gas is not converted to currency or public-network latency. The additional submission tests do not replace this historical gas baseline.

### 5.6 Circuit and Frontend Footprint

#### Circuit structure

The circuit-size inspection reports:

*Table 17. Circuit structure.*

| Metric | Value |
| --- | ---: |
| Curve | bn-128 |
| Wires | 4198 |
| Constraints | 4196 |
| Private inputs | 4 |
| Public inputs | 4 |
| Public outputs | 0 |

The circuit is intentionally small because it proves only one LTV rule. Adding more compliance rules would likely increase circuit size, setup complexity, proof generation time, and verifier maintenance overhead.

#### Frontend distribution

The archived frontend bundle snapshot documents the evaluated client distribution. These sizes support artifact inspection; they are not measurements of page-load latency or evidence for the LTV enforcement claim.

*Table 18. Archived frontend bundle sizes.*

| Asset | Size | Gzip |
| --- | ---: | ---: |
| `dist/index.html` | 0.40 kB | 0.27 kB |
| `dist/assets/index-BFtmxQu3.css` | 64.46 kB | 12.05 kB |
| `dist/assets/ccip-DAv_GoVX.js` | 3.04 kB | 1.39 kB |
| `dist/assets/index-B72wscIt.js` | 636.26 kB | 189.62 kB |

`du -sh frontend/dist` reports `2.5M`.

### 5.7 End-to-End Workflow Evidence

The local CLI workflow completes oracle verification, compliance proof generation, on-chain proof verification, loan request, loan-officer approval, and repayment.

Final local workflow evidence:

*Table 19. Single archived local workflow observation.*

| Scenario | Command | Duration | Final state |
| --- | --- | ---: | --- |
| Happy path | `pnpm demo:flow PROP-001 750000` | 1.82s | `Repaid` |

The recorded duration covers this full sequence on the local Hardhat chain.

![DApp borrower loan lifecycle](../docs/screenshots/04-borrower-loan-lifecycle.png)

*Figure 6. DApp evidence for the borrower loan lifecycle. The ledger shows multiple local outcomes, including repaid, approved, cancelled, and rejected loans, while the selected loan detail preserves proof binding and commitment evidence.*

### 5.8 Threats to Validity

The evaluation is designed to support a bounded prototype claim rather than a production performance claim. The main threats to validity are as follows.

Internal validity is affected by the use of a mock property registry and a single oracle process. The registry rules are deterministic and testable, but they do not capture the operational complexity of real title, appraisal, or lender data sources.

External validity is limited because all benchmark latency results are local. Hardhat provides reproducible execution and stable gas measurement, but it does not model public network congestion, RPC provider variability, wallet confirmation delays, or Sepolia transaction inclusion time.

Construct validity is limited by the benchmark scope. The updated matrix covers the successful path, exact boundary, one-unit-above-boundary rejection, invalid-registry rejection, and repeated proof-generation runs. It still does not measure concurrent production traffic, public-chain inclusion latency, or throughput under multiple independent borrowers.

Reproducibility is supported by recorded commands, environment, raw observations, commit, and dirty flag. The September files record `dirty: true` with untracked benchmark and manuscript artifacts; this is not an immutable release snapshot. The evaluation notes map reported results to source files, raw observations, and reproduction commands. Hardware, Node.js scheduling, session order, warm-up effects, and dependency versions can affect latency. The small sequential sessions cannot estimate rare failure rates, operational availability, or comparative speedups; no confidence intervals, matched baseline, or throughput experiment are reported.

### 5.9 Summary of Findings

The evaluation supports four conclusions.

First, the full local workflow executes within the declared prototype scope, and the test suites cover its core success and failure paths.

Second, the correctness matrix accepts below-limit and exact-boundary principals, and rejects a principal one unit above the 80% limit or an encumbered registry record before proof generation.

Third, the primary 30-run benchmark reports median direct proving of 399.53 ms and median read-only `/compliance` latency of 409.16 ms. This is consistent with proving dominating success-path latency, but independent invocations do not quantify API overhead or optimization gains.

Fourth, the archived whole compliance operation averages 310,411 gas, exceeding the reported lending-transition averages in that workload. The measurement includes binding checks, proof verification, writes, and events. It does not isolate verifier cost or compare single-policy and aggregated-policy circuits; economic feasibility and comparative circuit efficiency remain unevaluated.

## 6. Security and Privacy Analysis

### 6.1 Security Claim and Argument

Let `x = (k, Cv, Cp, t)` be the public statement and `w = (v, p, sv, sp)` the witness. The implemented relation requires:

```text
0 <= v, p < 2^64; 0 <= t < 2^14
Cv = MiMCSponge(k, v, sv)
Cp = MiMCSponge(k, p, sp)
10000 * p <= t * v
```

Here `k` is the Keccak-derived property identifier reduced modulo the BN254 scalar field. Salts are field elements and the wrapper fixes `t = 8000`. Both scaled products are below `2^78`; the inclusive comparison adds one to the right-hand product, still below the 80-bit comparison bound and far below the scalar-field modulus. The range constraints therefore make the intended comparison an integer inequality rather than a modular-arithmetic coincidence. The circuit permits zero values, whereas the oracle rejects a zero principal and its registry rules require a minimum valuation. Those application rules are not additional circuit predicates.

**Conditional approval property.** Assume Groth16 soundness for the deployed circuit and uncompromised setup, binding of the selected commitment construction, an honest oracle valuation record, and maintained role configuration in which only the designated `ComplianceVerifier` can write compliance. When `Lending.approveLoan` transitions a request to Approved, the property is currently verified and its stored principal commitment equals the request commitment. That compliance record was accepted for a witness satisfying the 80% relation and the current valuation commitment.

The argument follows the write path. Only the designated verifier can create a compliant record under the assumed role configuration. It checks all four signals and verifies the proof before writing that record. Any verification refresh clears compliance, and approval checks current verification and commitment equality. Thus a mismatched or absent current compliance record cannot cause an Approved transition. This is an argument from the implemented control flow, supported by tests, rather than a formal verification of the full protocol.

The property does not establish authentic legal ownership, ownership continuity between request and approval, proof age, exclusive use of a proof, secrecy of API responses, or ongoing collateral sufficiency after approval. Property-field binding additionally assumes that the relevant identifiers do not collide under Keccak and field reduction; the field mapping is not injective over all 256-bit identifiers. Administrators can change role configuration, and an extra compliance writer would invalidate the stated argument.

### 6.2 Assets and Data Exposure

The integrity-sensitive assets are property verification and ownership records, compliance state, the principal binding, loan lifecycle state, the active collateral lock, and role configuration. The oracle signing key, RPC credentials, deployment secrets, and hosted prover and transaction budgets are operational assets. The threat analysis distinguishes contract authorization from authorization to invoke the API that uses the privileged signer.

Valuation, principal, salts, and witness material are confidentiality-sensitive inputs. Their absence from blockchain transactions and storage is an implemented publication boundary, not evidence that the surrounding application protects them: the mock registry and API expose financial values, and the API also returns proof inputs. Section 6.6 analyzes these disclosure channels.

Public chain data includes the property key, owner address, valuation and principal commitments, proof hash and public signals, verification and compliance flags, events, and loan state. This visibility permits auditability and linkage even though plaintext valuation, principal, salts, and witness files are not supplied to the contracts.

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
- call a hosted Oracle API with write-enabled requests to consume prover resources or Sepolia test ETH;
- exploit stale frontend configuration.

The attacker is not assumed to break Ethereum execution, break Groth16 soundness under valid setup assumptions, compromise the trusted oracle machine, or compromise private keys outside the application model.

### 6.4 Implemented Mitigations

*Table 20. Mitigations and unmitigated API exposure.*

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
| Removal of final manager administrator | `RoleAdminManager` retains its final manager admin; managed-contract roles can still become partial |
| Malformed API input | Oracle validates network, property ID, and principal |
| Hosted Oracle write abuse | No implemented caller authorization or quota mechanism; input validation does not prevent consumption of signer funds or prover resources |

### 6.5 Security Properties and Evidence

The security claim can be decomposed into concrete properties. Each property is supported by an implemented mechanism and evaluated by tests or inspection, but each also has a remaining limitation.

*Table 21. Security properties, evidence and limitations.*

| Security property | Implemented mechanism | Evidence | Remaining limitation |
| --- | --- | --- | --- |
| No direct valuation publication on chain | MiMC commitment and private circuit input | Circuit and contract inspection | Registry/API expose valuation; deterministic salt permits candidate testing |
| No direct principal publication on chain | MiMC commitment and private circuit input | Circuit and contract inspection | Compliance API exposes principal and salts; anonymity is not provided |
| Property binding | Public signal 0 must match `propertyIdToField(propertyId)` | Contract tests for signal mismatch | Property key remains public |
| Valuation-state binding | Public signal 1 must match current on-chain valuation commitment | Contract tests; stale compliance clearing | Depends on honest oracle verification write |
| Principal binding | Public signal 2 must match the submitted principal commitment | Contract tests; approval mismatch tests | Same proof can be reused for same property/principal pair |
| Policy binding | Public signal 3 must equal fixed `MAX_LTV_BPS = 8000` | Contract tests for threshold tampering | Policy is fixed; multiple policies are future work |
| Compliance write integrity | Only `ComplianceVerifier` has `COMPLIANCE_ROLE` | Deployment and role tests | Generated verifier must correspond to intended circuit |
| Loan approval gating | Owner checked at request; verification, compliance, principal binding, officer role, and state checked at approval | Loan lifecycle and submission tests | Owner is not rechecked at approval; approved state is not continuously revalidated |
| Collateral lock | `activeLoanByProperty` prevents duplicate active borrowing | Contract tests | No real lien, liquidation, or legal collateral integration |
| Manager administrator retention | Removal of final manager admin is blocked | RoleAdminManager tests | Partial roles across managed contracts remain possible; no multisig or timelock |

The adversarial test matrix used for the prototype is summarized below. It consolidates contract, Oracle API, frontend, and benchmark evidence into security-relevant attack or misuse cases.

*Table 22. Prototype adversarial scenarios.*

| Category | Scenario | Expected behavior | Evidence |
| --- | --- | --- | --- |
| Role misuse | Non-oracle, non-verifier, non-loan-officer, or non-borrower calls a privileged function | Revert or guarded failure | Contract tests |
| Proof misuse | Proof is tampered with or public signals bind to the wrong property, valuation, principal, or threshold | Compliance update rejected | Contract tests |
| Boundary abuse | Principal is exactly at, or one unit above, the 80 percent LTV boundary | Boundary passes; over-limit case rejects without proof generation | Benchmark matrix |
| Registry failure | Encumbered property record is submitted | Oracle rejects and skips proof generation | Oracle API tests; benchmark matrix |
| State replay | Property verification is refreshed after compliance | Stale compliance and principal binding are cleared | Contract tests |
| Collateral reuse | Borrower attempts another active loan for the same property | Duplicate active borrowing is rejected | Contract tests |
| API abuse | Malformed property ID, unsupported network, or invalid principal is submitted | API returns validation failure without server error | Oracle API tests |
| Frontend wallet gate | User has not connected a wallet or entered the app | Wallet-gate component displays the corresponding state | Component tests; not full application authorization evidence |

The additional submission tests also document accepted behaviors that limit the claims:

*Table 23. Accepted boundary behaviors established by added tests.*

| Boundary scenario | Observed contract behavior | Implication |
| --- | --- | --- |
| Verification refresh retains the valuation commitment | Stored compliance clears; the same proof can restore it | State reset does not imply proof freshness |
| Owner changes after request, with the valuation commitment retained | Original borrower's request can still be approved after proof resubmission | Ownership is not bound into the proof or rechecked at approval |
| Another compliant principal is submitted before approval | The old pending request is rejected and its lock released | The property has one mutable compliance slot, not independent loan attestations |
| Verification refresh occurs after approval | Approved loan and active lock remain | Approval is a snapshot; later compliance does not trigger servicing actions |

The matrix is evidence of systematic prototype-level security and adversarial testing. It is not a third-party audit and does not establish production security.

### 6.6 Privacy Boundary

Three distinct properties must be separated. First, the circuit's witness values are absent from the Groth16 public-signal vector. Second, the transaction interface and stored records do not directly publish those values. Third, confidentiality of the application would require commitments and all auxiliary channels to prevent recovery of those values. The implementation demonstrates the first two properties but does not establish the third.

The valuation salt is deterministically derived from property context and an owner hash; an observer with those inputs can recompute it. Given a small domain of plausible valuations, the observer can test candidates against the public commitment. Groth16 zero knowledge does not hide information already revealed by the statement, a weakly blinded commitment, or another interface. Fresh random principal salts improve blinding only when kept secret, and the current compliant API response returns both salts and the witness values in `proofInputs`.

The mock dataset is available in the artifact, and the unauthenticated API returns valuation and principal-related data. Public wallet addresses, property identifiers, proof hashes, events, and lifecycle state also support linkage. The appropriate claim for this prototype is selective omission of financial plaintext from the blockchain, under an explicitly trusted prover. No indistinguishability experiment, entropy analysis, or confidentiality proof for the complete application is reported.

### 6.7 Replay and Freshness Analysis

The proof is bound to four public values: the property key mapped into the SNARK field, the current on-chain valuation commitment, the submitted principal commitment, and the fixed maximum LTV threshold. `ComplianceVerifier` checks these public signals before calling the generated Groth16 verifier. This prevents a proof generated for one property, valuation commitment, principal commitment, or LTV threshold from being accepted for a different on-chain context.

When `PropertyVerification.setVerified` refreshes a property record, it clears the existing compliance flag and principal commitment. A later approval requires a compliant record bound to the current valuation commitment, but the proof need not have been generated after the refresh. If that commitment is unchanged, old proof calldata can recreate the record, as the submission test demonstrates.

The proof is not bound to a borrower address, loan ID, chain ID, deployment address, timestamp, expiry, registry version, or single-use nonce. The same proof is reusable wherever its signals and verification key remain compatible. Request-time ownership and the active-loan lock still constrain lending, but ownership is not rechecked at approval. A complete freshness design should specify the intended scope, incorporate its nonce/version/domain into the proved statement, and consume or validate that context on chain; adding a timestamp to an event alone would not provide this guarantee.

### 6.8 Hosted Oracle API Exposure

The hosted Oracle API used for optional Sepolia validation is a testnet service. It lacks caller authentication, request signing, rate limiting, per-origin transaction policy, and operator approval for individual writes.

When write-enabled requests are allowed, a public caller can trigger proving or verification/compliance transactions through the configured Oracle signer. Contract roles authorize that signer rather than the API caller, leaving test ETH, prover CPU, and service capacity exposed.

The absence of real asset settlement limits financial exposure but does not prevent data disclosure, unauthorized signer use, or denial of service. Deployment beyond a controlled demonstration requires authenticated and authorized callers, restricted response schemas, quotas, transaction allowlists, monitoring, and explicit key-management controls. CORS does not authorize callers.

### 6.9 Residual Risk Summary

The mechanisms above constrain role misuse, signal substitution, invalid approval transitions, and duplicate active borrowing under the stated oracle, setup, commitment, and role assumptions. They leave three principal application risks: source and witness trust, an incomplete proof lifecycle, and incomplete operational authorization. The concrete boundaries are documented in Table 23 and Sections 6.6-6.8: unchanged-context replay, ownership changes before approval, replacement of a property's compliance record, witness disclosure, and API use of the oracle signer.

These boundaries limit the approval claim to the checked state transition. They do not establish confidential application operation, continuous collateral sufficiency, or safe handling of real assets. Chapter 8 explains the effect on applicability and prioritizes the corresponding engineering and evaluation work.

## 7. Discussion and Architectural Trade-offs

The evaluation establishes local behavior and measured costs, while the security analysis identifies the conditions under which approval is justified. This chapter connects those findings to the research subquestions, explains the architectural choices, and distinguishes the reusable pattern from the limits of this implementation.

### 7.1 Answers to the Research Subquestions

**Representation of off-chain facts.** Valuation and principal are represented by property-bound MiMC commitments, while the oracle writes the property verification record. The circuit checks the committed witness rather than publishing the financial inputs. This answers the publication question at the contract interface; it does not establish source authenticity or confidentiality against registry/API access or candidate testing of deterministically blinded valuations.

**Binding the proof to the lending context.** The wrapper checks the property field, current valuation commitment, submitted principal commitment, and fixed LTV threshold before the generated verifier is called. Approval then checks compliance against the request's principal commitment. The public-signal mismatch and substitution tests support this link between proof validity and application state. The mechanism establishes binding under the commitment, identifier-mapping, setup, and role assumptions in Section 6.1.

**Current compliance and proof freshness.** An absent or mismatched compliance record cannot authorize approval, and a verification refresh clears the stored record. This is current-state enforcement rather than proof-age enforcement: when the valuation commitment is unchanged, an earlier proof can restore compliance. Ownership is checked at request time, and the approved loan is not automatically revalidated after later changes. The accepted behaviors in Table 23 therefore define the boundary of the answer, rather than supporting a claim of single-use, expiring, or loan-specific proofs.

**Measured implementation costs.** The primary local session reports median direct proving of 399.53 ms and read-only compliance response latency of 409.16 ms. The archived complete compliance operation averages 310,411 gas, including binding checks, verification, writes, and events. Circuit and frontend footprint measurements document the artifact. These results answer the cost question for the selected local implementation; independent invocations and the absence of matched baselines prevent conclusions about API overhead, comparative efficiency, public-chain latency, or production capacity.

**Remaining trust assumptions.** Zero knowledge constrains the proved relation but does not authenticate a real property valuation, protect a privileged service interface, or define legal collateral ownership. The argument depends on the oracle and registry record, proof-system setup, commitment and identifier assumptions, and maintained role configuration. The mock registry, exposed witness delivery, proof lifecycle, and approval snapshot are consequential application boundaries. Their operational implications motivate the priorities in Section 8.2.

Taken together, the answers support a proof-to-state binding pattern for a local lending prototype. The evidence supports omission of financial plaintext from the blockchain and conditional approval enforcement, while broader application confidentiality and lending readiness remain unestablished.

### 7.2 Architecture and Trust Trade-offs

*Table 24. Qualitative architectural comparison.*

| Architecture | Financial input disclosure | Chain check | Main trust assumption | Status |
| --- | --- | --- | --- | --- |
| Plaintext on-chain verification | Public valuation and principal | Direct LTV check | Authentic source and correct contract | Conceptual |
| Off-chain-only verification | Backend access controls | None | Backend operator | Conceptual |
| ProofEstate Groth16 design | Plaintext omitted; hiding not established | Proof and state binding | Oracle, setup, binding, roles | Implemented |
| PLONK-style ZK | Commitments and interfaces | Verifier and binding | Setup model and correct verifier | Not implemented |
| STARK-style ZK | Commitments and interfaces | Verifier and binding | Hash/proof assumptions and correct verifier | Not implemented |
| Threshold oracle | Attestation and proof design | Attestation checks | Honest threshold and governance | Not implemented |

The comparison describes mechanisms and implementation status. No matched implementations, comparative latency/gas measurements, or production-security ratings are reported. Four criteria informed the implementation:

*Table 25. Criteria informing the implementation.*

| Criterion | Reason for importance | Effect on design choice |
| --- | --- | --- |
| Minimal disclosure | The research question requires omitting valuation and principal plaintext from the blockchain | Rejects plaintext on-chain verification |
| Auditable enforcement | Loan approval should depend on contract-checkable state, not only backend discretion | Rejects off-chain-only approval |
| Reproducibility | The system must be implementable and evaluable within a dissertation prototype | Favors a centralized oracle and a narrow Groth16 circuit |
| Implementation tractability | The prototype must include contracts, circuit, oracle, DApp, tests, and benchmarks | Defers threshold oracles, multiple policies, and larger proof systems to future work |

Plaintext on-chain verification would make the LTV calculation directly inspectable, but would publish its financial inputs. Off-chain-only approval could avoid that publication, but would leave enforcement to backend application logic. ProofEstate places the predicate check and approval conditions in the contract path, retaining off-chain responsibility for valuation authenticity and witness handling.

Groth16 fits the implemented fixed circuit and its generated EVM verifier, at the cost of circuit-specific setup [4]. PLONK-style and STARK-style systems offer different setup and transparency choices [8], [9]. They were not implemented here, so this architectural discussion does not rank their performance or claim that Groth16 is the best option for every deployment. A proof-system change would also require revisiting artifacts, verifier integration, and the application binding checks.

Similarly, the centralized oracle keeps the local prototype tractable but concentrates source, witness, and signer trust. Signed registry attestations or threshold validation could reduce particular dependencies; their benefits would depend on authenticated sources, governance, protected witness delivery, and explicit failure handling. They are candidate designs rather than evaluated guarantees of this artifact.

### 7.3 Generalization and Applicability

The reusable design pattern is:

```text
private facts
-> trusted or attested source
-> commitment
-> zero-knowledge policy proof
-> verification against current application state
-> authorized state transition
```

Potential applications include income threshold checks, identity eligibility, insurance claims, and other asset-backed lending. The transferable contribution is the connection between a proved predicate and the precise state transition it may authorize. The real-estate registry rules, illustrative 80% threshold, and role configuration are application-specific.

Each adaptation must define its authenticated data source, confidential witness path, policy circuit, commitment construction, proof scope and expiry, and authorization rules. The present implementation does not demonstrate those other applications. Its accepted replay and ownership-change cases also show why reusing the cryptographic relation alone is insufficient to establish the application-level guarantee.

## 8. Limitations and Future Work

### 8.1 Limitations of Scope and Evidence

ProofEstate evaluates a mock registry, centralized oracle, fixed 80% predicate, and prototype Groth16 setup. These choices permit reproducible integration and inspection, but do not establish authenticity of real property records, legal ownership or lien enforcement, or jurisdiction-specific lending eligibility. Identity and credential verification, real disbursement and repayment accounting, delinquency handling, and liquidation are outside the implemented workflow. Repayment is a state transition rather than settlement.

The security limitations identified in Chapter 6 constrain the interpretation of the result: blockchain plaintext omission is not application-wide confidentiality, current compliance is not proof freshness, and approval is a snapshot rather than continuing collateral validation. They are demonstrated boundaries of the implementation, not assumptions that can be silently removed when applying the design elsewhere.

The performance and workflow observations are local and sequential. Small timing sessions, a historical gas workload, an archived dirty working tree, and selected component tests cannot establish public-network availability, concurrent-user capacity, comparative speedups, or complete user-interface correctness. Optional Sepolia support does not change the source of the reported benchmark evidence. A production adaptation needs new implementation and new evidence for the stronger claims it intends to make.

### 8.2 Prioritized Future Work

The following priorities follow from the demonstrated boundaries and the intended move beyond a controlled prototype.

1. **Source authenticity and confidential service operation.** Authenticate and authorize API callers, restrict responses containing witness material, protect signer keys, and impose transaction and prover quotas. Replace deterministic valuation blinding with a reviewed confidential commitment and witness-delivery design. Integrate authenticated registry attestations before treating valuations as real lending inputs; threshold validation can then be assessed against the chosen trust model.
2. **Proof lifecycle and ownership continuity.** Define whether proofs are reusable, expiring, registry-version-specific, or loan-specific. Bind and validate the selected borrower, loan, nonce/version, and deployment domain in the proved statement and contracts. Specify ownership revalidation at approval, the effect of principal replacement, and the policy for collateral changes after approval. Regression tests should verify those intended rules against the currently accepted boundary cases.
3. **Settlement and operational controls.** Introduce real asset accounting, payment and repayment flows, default and liquidation rules, and appropriate transfer protections. Add identity/credential policies where required by the intended application, together with production key management, coherent role administration, monitoring, and incident response. These capabilities should be evaluated as a separate extension of the approval prototype.
4. **Broader experimental validation.** Record an immutable release snapshot; evaluate authenticated service behavior, concurrent users, transaction inclusion, and end-to-end wallet flows. Implement matched alternatives before making comparative performance claims, and expand timing sessions with a statistical design appropriate to the claim. Additional policy circuits and alternative proof systems are later candidates once the source, privacy, and lifecycle boundaries are resolved.

### 8.3 Ethical and Deployment Boundary

ProofEstate uses mock property records, test accounts, local Hardhat execution, and optional Sepolia validation. It does not process real borrower data, real land-registry data, production credentials, or real asset transfers. The prototype should therefore be evaluated as a technical artifact for privacy-preserving compliance enforcement, not as a deployable lending service.

Any production adaptation would require legal, regulatory, and operational review in addition to technical hardening. In particular, real-estate lending involves identity verification, consumer-protection obligations, appraisal standards, lien registration, repayment accounting, default handling, and jurisdiction-specific compliance. Those requirements are outside the implemented artifact and should not be inferred from the prototype's successful local workflow.

## 9. Conclusion

ProofEstate demonstrates how a zero-knowledge LTV relation can be connected to an auditable lending state machine. The implemented proof establishes that a committed principal is at most 80% of a committed valuation. Application-level checks bind that proof to the property's current valuation commitment and the requested principal commitment before approval can occur, under the stated oracle, setup, commitment, and role assumptions.

The evidence includes functional tests, archived workflow and gas inspection, four input scenarios, and sequential timing sessions. The primary reported proof-generation median is 399.53 ms and the read-only API compliance median is 409.16 ms; these exclude chain transactions. Complete proof verification and compliance update average 310,411 gas in the historical test workload. The measurements quantify the selected local implementation without establishing comparative speedups, public-network latency, or production capacity.

The strongest supported privacy result is the omission of valuation and principal plaintext from the blockchain; the registry, deterministic valuation salt, and API remain disclosure channels. The six additional security tests make freshness, ownership, proof replacement, and approval-snapshot limitations explicit. Production confidentiality, robust oracle trust, proof lifecycle control, real settlement, and public-network scalability remain open engineering and evaluation requirements.

## References

[1] G. Wood, "Ethereum: A Secure Decentralised Generalised Transaction Ledger," Ethereum Yellow Paper. Available at: https://github.com/ethereum/yellowpaper

[2] V. Buterin, "Ethereum Whitepaper: A Next-Generation Smart Contract and Decentralized Application Platform," 2014. Available at: https://ethereum.org/whitepaper/

[3] OpenZeppelin, "Access Control," OpenZeppelin Contracts 5.x Documentation. Available at: https://docs.openzeppelin.com/contracts/5.x/access-control

[4] J. Groth, "On the Size of Pairing-Based Non-interactive Arguments," EUROCRYPT 2016, LNCS 9666, pp. 305-326, 2016. DOI: 10.1007/978-3-662-49896-5_11.

[5] M. R. Albrecht, L. Grassi, C. Rechberger, A. Roy, and T. Tiessen, "MiMC: Efficient Encryption and Cryptographic Hashing with Minimal Multiplicative Complexity," ASIACRYPT 2016, pp. 191-219, 2016. DOI: 10.1007/978-3-662-53887-6_7.

[6] iden3, "Circom 2 Documentation." Available at: https://docs.circom.io/

[7] iden3, "snarkjs: zkSNARK implementation in JavaScript and WASM." Available at: https://github.com/iden3/snarkjs

[8] A. Gabizon, Z. J. Williamson, and O. Ciobotaru, "PLONK: Permutations over Lagrange-bases for Oecumenical Noninteractive arguments of Knowledge," IACR Cryptology ePrint Archive, Report 2019/953, 2019. Available at: https://eprint.iacr.org/2019/953

[9] E. Ben-Sasson, I. Bentov, Y. Horesh, and M. Riabzev, "Scalable, transparent, and post-quantum secure computational integrity," IACR Cryptology ePrint Archive, Report 2018/046, 2018. Available at: https://eprint.iacr.org/2018/046

[10] Compound Finance, "Compound Protocol." Available at: https://github.com/compound-finance/compound-protocol

[11] Aave, "Aave V3 Technical Paper." Available at: https://github.com/aave/aave-v3-core/blob/master/techpaper/Aave_V3_Technical_Paper.pdf

[12] Chainlink, "Chainlink 2.0 and the future of Decentralized Oracle Networks." Available at: https://chain.link/whitepaper

[13] F. Schär, "Decentralized Finance: On Blockchain- and Smart Contract-Based Financial Markets," Federal Reserve Bank of St. Louis Review, vol. 103, no. 2, pp. 153-174, 2021. DOI: 10.20955/r.103.153-74.

[14] F. Zhang, E. Cecchetti, K. Croman, A. Juels, and E. Shi, "Town Crier: An Authenticated Data Feed for Smart Contracts," Proceedings of the 2016 ACM SIGSAC Conference on Computer and Communications Security, pp. 270-282, 2016. DOI: 10.1145/2976749.2978326.

[15] F. Zhang, D. Maram, H. Malvai, S. Goldfeder, and A. Juels, "DECO: Liberating Web Data Using Decentralized Oracles for TLS," Proceedings of the 2020 ACM SIGSAC Conference on Computer and Communications Security, pp. 1919-1938, 2020. DOI: 10.1145/3372297.3417239.

[16] E. Ben-Sasson, A. Chiesa, C. Garman, M. Green, I. Miers, E. Tromer, and M. Virza, "Zerocash: Decentralized Anonymous Payments from Bitcoin," 2014 IEEE Symposium on Security and Privacy, pp. 459-474, 2014. DOI: 10.1109/SP.2014.36.

[17] A. Kosba, A. Miller, E. Shi, Z. Wen, and C. Papamanthou, "Hawk: The Blockchain Model of Cryptography and Privacy-Preserving Smart Contracts," 2016 IEEE Symposium on Security and Privacy, pp. 839-858, 2016. DOI: 10.1109/SP.2016.55.

## Appendix A: Key Reproduction Commands

### A.1 Compile, Test, and Run the Workflow

Run the following from the repository root with the recorded dependency versions. The chain, oracle, and workflow commands require the separate terminals described in the repository README.

```bash
nvm use
pnpm compile
pnpm test:all
pnpm test:gas
```

Local end-to-end workflow:

```bash
pnpm chain:local
pnpm demo:deploy
pnpm oracle:api
pnpm demo:ready
pnpm demo:flow PROP-001 750000
```

### A.2 Reproduce the Timing Matrix

The benchmark commands require the local Oracle API. The historical observations remain archived evidence; a new run produces measurements for the current environment.

Primary compliant path, with five warm-ups and 30 measured iterations:

```bash
pnpm benchmark:local --warmups=5 --runs=30 \
  --property=PROP-001 --principal=750000 \
  --api=http://127.0.0.1:8787
```

Exact boundary, one-unit-above-boundary rejection, and invalid registry record:

```bash
pnpm benchmark:local --warmups=5 --runs=30 \
  --property=PROP-001 --principal=784000 \
  --api=http://127.0.0.1:8787
pnpm benchmark:local --warmups=5 --runs=30 \
  --property=PROP-001 --principal=784001 \
  --api=http://127.0.0.1:8787
pnpm benchmark:local --warmups=5 --runs=30 \
  --property=PROP-004 --principal=100000 \
  --api=http://127.0.0.1:8787
```

Additional bounded repeated-run sessions; the primary command supplies the 30-run comparison:

```bash
pnpm benchmark:local --warmups=5 --runs=10 \
  --property=PROP-001 --principal=750000 \
  --api=http://127.0.0.1:8787
pnpm benchmark:local --warmups=5 --runs=50 \
  --property=PROP-001 --principal=750000 \
  --api=http://127.0.0.1:8787
```

## Appendix B: Evidence Documents

*Table 26. Repository evidence documents.*

| Document | Purpose |
| --- | --- |
| `docs/evaluation-notes.md` | Final functional and environment evidence |
| `docs/benchmarks/final-benchmarks.md` | Final benchmark summary |
| `docs/benchmarks/raw/local-2026-09-25T08-40-22-730Z.json` | Primary final compliant-path raw benchmark data |
| `docs/smart-contract-interface-spec.md` | Contract interface specification |
| `docs/zk-proof-design.md` | ZK proof design |
| `docs/security-evaluation-report.md` | Security evaluation |
| `docs/design-decisions.md` | Architecture decisions and comparison |
| `docs/limitations-and-extensions.md` | Limitations, future work, and generalization |
| `docs/screenshots/README.md` | Local DApp screenshot evidence index |

## Appendix C: DApp Screenshot Evidence

The DApp screenshots were captured against the local Hardhat and oracle workflow. They serve as visual evidence for the browser-based workflow and complement the CLI, test, benchmark, and gas evidence reported in Section 5. Any plaintext values visible in these screenshots are local mock evaluation values, not plaintext values stored by the contracts.

*Table 27. Screenshot evidence inventory.*

| Screenshot | Evidence shown |
| --- | --- |
| `docs/screenshots/01-property-verification-success.png` | `PROP-001` verification completed with property data, verification rules, on-chain record, valuation commitment, and proof status |
| `docs/screenshots/02-property-verification-rejection-case.png` | `PROP-010` inactive registry status case showing verification waiting state and unverified on-chain record |
| `docs/screenshots/03-zk-compliance-proof-verified.png` | ZK compliance proof completed for principal `750000`, LTV below the maximum borrow amount, reusable on-chain proof, and proof binding matched |
| `docs/screenshots/04-borrower-loan-lifecycle.png` | Borrower loan request and repayment workspace with loan details, proof binding, collateral lock, and lifecycle ledger |
| `docs/screenshots/05-loan-officer-approval-workspace.png` | Loan officer approval workspace with loan book, approval decision, commitments, terms, and timeline |
| `docs/screenshots/06-admin-role-access-management.png` | Admin role management, role directory, grant/revoke controls, target inspector, role records, and admin readiness |
| `docs/screenshots/07-contract-network-operations.png` | Contract and network operations view showing service metrics, contract coverage, local RPC readiness, oracle service readiness, and contract matrix |
| `docs/screenshots/08-audit-logs-overview.png` | Audit log overview showing portfolio metrics, issued exposure, on-chain activity, proof coverage, permission changes, and loan ledger |
| `docs/screenshots/09-onchain-event-traceability.png` | On-chain event log showing proof/property/loan events, event fields, operator role, contract address, block, and transaction hash |
