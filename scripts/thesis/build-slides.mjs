#!/usr/bin/env node
/**
 * Build the editable, 15-slide ProofEstate defense deck from this source.
 * Run: pnpm thesis:slides
 * Optional: --out <file.pptx> --preview-dir <directory>
 * Requires the Codex-bundled @oai/artifact-tool presentation runtime (>= 2.7.3).
 * ARTIFACT_TOOL_PATH can point to its package directory on another machine.
 * Speaker Notes contain only the read-aloud script; evidence paths stay here.
 */
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const TITLE = "ProofEstate: Blockchain-Based Real Estate Lending Platform with ZK Compliance and Property Verification";
const REPOSITORY_URL = "https://github.com/Alan42x/proofestate";
const DEMO_URL = "https://proofestate.vercel.app/";
const SIZE = { width: 1280, height: 720 };
const C = {
  blue: "#003D7C", orange: "#EF7C00", ink: "#13283E", gray: "#586879",
  rule: "#CCD5DF", orangeTint: "#FFF2E3", blueTint: "#F0F4F8",
  white: "#FFFFFF", navy: "#082C4E",
};
const LOGO = "slides/assets/nus-logo.png"; // Unmodified NUS mark from the existing deck.

// Slide content, layout, evidence pointers and spoken Notes are maintained together.
// Coordinates and font sizes are in pixels on a 1280 × 720 canvas.
const DECK = [
  // 01 — CAPSTONE PROJECT DEFENSE
  {
    title: TITLE,
    kicker: "CAPSTONE PROJECT DEFENSE",
    source: "ProofEstate thesis, Chs. 5–6; local prototype evaluation.",
    evidence: [
      "test/proofestate.test.js",
      "docs/benchmarks/final-benchmarks.md",
      "docs/evaluation-notes.md",
    ],
    notes: `Good morning, everyone. I am Zhang Tianyi, and today I will present ProofEstate, a real-estate lending prototype with zero-knowledge compliance and property verification.

The project asks how a public smart contract can enforce a lending rule while keeping the property's valuation and requested loan amount out of blockchain transactions and storage.

I implemented a complete workflow connecting a mock property registry, an oracle, a zero-knowledge circuit, smart contracts, and a React application. The central contribution is the connection between a valid private proof and the public state that authorizes a loan.

I will explain the design, show the application and evaluation results, and finish with the security boundaries and future work.`,
    draw: ({ text, rect, image, connect }) => {
      text("ProofEstate:", 64, 145, 1130, 73, 56, C.blue, { bold: true });
      text("Blockchain-Based Real Estate Lending Platform", 64, 236, 1130, 46, 38, C.blue, { bold: true });
      text("with ZK Compliance and Property Verification", 64, 284, 1130, 46, 38, C.blue, { bold: true });
      rect(64, 344, 1152, 1, C.orange);
      text("Binding a private LTV relation to an auditable lending decision", 64, 366, 1120, 42, 26, C.gray);
      text("Zhang Tianyi", 64, 431, 430, 38, 26, C.blue, { bold: true });
      text("Supervisor: Nicholas Mac Gregor GARCIA", 64, 473, 1060, 34, 21, C.gray);
      text("37", 64, 531, 330, 65, 46, C.blue, { bold: true });
      text("contract + circuit tests", 64, 601, 330, 30, 22, C.blue, { bold: true });
      text("12 API + 6 frontend tests", 64, 639, 330, 24, 17, C.gray);
      text("399.53 ms", 452, 531, 340, 65, 46, C.blue, { bold: true });
      text("median local proof", 452, 601, 340, 30, 22, C.blue, { bold: true });
      text("30 measured local runs", 452, 639, 340, 24, 17, C.gray);
      text("310,411 gas", 870, 531, 346, 65, 46, C.blue, { bold: true });
      text("compliance operation", 870, 601, 346, 30, 22, C.blue, { bold: true });
      text("Measured transaction workload", 870, 639, 346, 24, 17, C.gray);
    },
  },

  // 02 — RESEARCH QUESTION
  {
    title: "Private proofs connect financial rules to public decisions",
    kicker: "RESEARCH QUESTION",
    source: "ProofEstate thesis, §§1.1–1.3, 2.8, 7.2.",
    evidence: [
      "docs/design-decisions.md",
    ],
    notes: `The research problem is the link between a private calculation and a public lending decision.

A plaintext contract can check the loan-to-value ratio directly, but it publishes the financial inputs. An off-chain service can make the calculation privately, but the blockchain then relies on that service's decision.

ProofEstate commits to the valuation and principal, proves the lending rule, and checks the proof against the current property and loan context before approval.

This gives the chain verifiable evidence without supplying those financial values as plaintext. Privacy across the rest of the application also depends on how the registry, API, and proving service handle the inputs. I will return to that distinction in the security findings.`,
    draw: ({ text, rect, image, connect }) => {
      text("Can a public contract approve a loan without publishing valuation or principal?", 64, 213, 1144, 76, 30, C.blue, { bold: true });
      rect(64, 316, 1152, 52, C.blue);
      text("Design", 78, 330, 257, 24, 20, C.white, { bold: true });
      text("Chain enforcement", 363, 330, 362, 24, 20, C.white, { bold: true });
      text("Financial plaintext", 753, 330, 449, 24, 20, C.white, { bold: true });
      text("Plaintext on chain", 78, 384, 257, 46, 22, C.blue, { bold: true });
      text("Contract checks the inequality", 363, 384, 362, 46, 22, C.ink);
      text("Published in calldata / storage", 753, 384, 449, 46, 22, C.ink);
      rect(64, 446, 1152, 1, C.rule);
      text("Off-chain decision", 78, 462, 257, 46, 22, C.blue, { bold: true });
      text("Backend decision only", 363, 462, 362, 46, 22, C.ink);
      text("Depends on backend access controls", 753, 462, 449, 46, 22, C.ink);
      rect(64, 524, 1152, 1, C.rule);
      rect(64, 524, 1152, 78, C.orangeTint);
      text("ProofEstate", 78, 540, 257, 46, 22, C.blue, { bold: true });
      text("Proof + state binding at approval", 363, 540, 362, 46, 22, C.ink);
      text("Omitted from chain; API still exposes it", 753, 540, 449, 46, 22, C.ink);
      rect(64, 602, 1152, 1, C.rule);
      text("Contribution: a working proof-to-state integration with executable boundary tests.", 64, 626, 1144, 29, 22, C.blue, { bold: true });
    },
  },

  // 03 — SYSTEM ARCHITECTURE
  {
    title: "Trusted data and bound proofs drive lending decisions",
    kicker: "SYSTEM ARCHITECTURE",
    source: "ProofEstate thesis, §§3.2–3.4, 4.2–4.3.",
    evidence: [
      "contracts/PropertyVerification.sol",
      "contracts/ComplianceVerifier.sol",
      "contracts/Lending.sol",
      "backend/oracle/service.js",
    ],
    notes: `The architecture has three parts: the registry and client, the oracle and prover, and the public contracts.

The mock registry supplies ownership, valuation, and eligibility records. The React application submits verification requests and lets borrowers and officers operate the loan workflow.

The oracle validates the registry record, prepares commitments and witness inputs, and invokes the Groth16 prover. PropertyVerification stores the property record. ComplianceVerifier checks the public signals, calls the generated verifier, and writes compliance. Lending reads the stored verification and principal commitment at approval.

The contracts enforce these checks on chain. The oracle remains responsible for the accuracy of the external record and handles the plaintext proving inputs.`,
    draw: ({ text, rect, image, connect }) => {
      text("Registry / client", 64, 212, 320, 31, 22, C.blue, { bold: true });
      text("Trusted oracle / prover", 456, 212, 360, 31, 22, C.blue, { bold: true });
      text("Public contract state", 896, 197, 320, 31, 22, C.blue, { bold: true });
      rect(64, 268, 320, 116, C.white, { border: C.rule, name: "registry" });
      text("Mock property registry", 82, 283, 284, 30, 23, C.blue, { bold: true });
      text("Owner, valuation and eligibility", 82, 319, 284, 51, 21, C.gray);
      rect(456, 268, 360, 116, C.white, { border: C.rule, name: "oracle" });
      text("Oracle API", 474, 283, 324, 30, 23, C.blue, { bold: true });
      text("/verify and /compliance", 474, 319, 324, 51, 21, C.gray);
      rect(896, 239, 320, 116, C.white, { border: C.rule, name: "property-state" });
      text("PropertyVerification", 914, 254, 284, 30, 23, C.blue, { bold: true });
      text("Owner, Cv and compliance record", 914, 290, 284, 51, 21, C.gray);
      rect(64, 487, 320, 116, C.white, { border: C.rule, name: "dapp" });
      text("React DApp / wallets", 82, 502, 284, 30, 23, C.blue, { bold: true });
      text("Oracle requests and loan actions", 82, 538, 284, 51, 21, C.gray);
      rect(456, 487, 360, 116, C.white, { border: C.rule, name: "prover" });
      text("Groth16 prover", 474, 502, 324, 30, 23, C.blue, { bold: true });
      text("Witness → proof + public signals", 474, 538, 324, 51, 21, C.gray);
      rect(896, 383, 320, 116, C.white, { border: C.rule, name: "compliance" });
      text("ComplianceVerifier", 914, 398, 284, 30, 23, C.blue, { bold: true });
      text("Bindings → generated verifier", 914, 434, 284, 51, 21, C.gray);
      rect(896, 527, 320, 116, C.white, { border: C.rule, name: "lending" });
      text("Lending", 914, 542, 284, 30, 23, C.blue, { bold: true });
      text("Reads current verification and Cp", 914, 578, 284, 51, 21, C.gray);
      connect("registry", "oracle", "right", "left", "straight");
      connect("oracle", "property-state", "right", "left", "elbow");
      connect("oracle", "prover", "bottom", "top", "straight");
      connect("prover", "compliance", "right", "left", "elbow");
      connect("compliance", "property-state", "top", "bottom", "straight");
      connect("lending", "property-state", "right", "right", "elbow");
      connect("dapp", "oracle", "right", "left", "elbow");
      text("Witness inputs", 650, 422, 166, 30, 18, C.gray);
      text("Current API exposes witness values and salts.", 64, 409, 344, 62, 21, C.orange, { bold: true });
    },
  },

  // 04 — PROOF STATEMENT
  {
    title: "The circuit proves LTV and commitment openings",
    kicker: "PROOF STATEMENT",
    source: "ProofEstate thesis, §§4.4, 5.6, 6.1; circuit implementation.",
    evidence: [
      "circuits/ltv.circom",
      "zk/ltvCircuit.js",
    ],
    notes: `The circuit checks the lending inequality and the openings of both commitments.

Here, v is the property valuation, p is the principal, and t is the threshold in basis points. Ten thousand times the principal must be no greater than the threshold times the valuation. The contract fixes t at eight thousand, giving an inclusive eighty percent limit.

The public statement contains the property field identifier, valuation commitment, principal commitment, and threshold. The witness contains the valuation, principal, and their salts. Both MiMC Sponge commitments include the property identifier.

Range constraints make the comparison behave as an integer inequality. The circuit contains four thousand, one hundred and ninety-six constraints. Its witness is private to the proof system, while the oracle handles those values during proving.`,
    draw: ({ text, rect, image, connect }) => {
      text("10000p ≤ tv", 64, 224, 594, 91, 64, C.blue, { bold: true, font: "Georgia" });
      text("t = 8000 in the contract wrapper", 64, 335, 603, 39, 25, C.orange, { bold: true });
      text("Cv = MiMCSponge(k, v, sv)", 64, 404, 626, 41, 25, C.ink, { font: "Courier New" });
      text("Cp = MiMCSponge(k, p, sp)", 64, 447, 626, 41, 25, C.ink, { font: "Courier New" });
      text("64-bit v, p · 14-bit t · 80-bit comparison", 64, 550, 630, 44, 23, C.blue, { bold: true });
      text("4,196 constraints · BN254 / bn-128", 64, 599, 630, 38, 23, C.gray);
      rect(746, 223, 1, 409, C.rule);
      text("PUBLIC STATEMENT", 790, 225, 426, 32, 18, C.orange, { bold: true });
      text("k   Property field ID", 790, 269, 426, 37, 25, C.ink, { font: "Courier New" });
      text("Cv  Valuation commitment", 790, 308, 426, 37, 25, C.ink, { font: "Courier New" });
      text("Cp  Principal commitment", 790, 347, 426, 37, 25, C.ink, { font: "Courier New" });
      text("t   Policy threshold", 790, 386, 426, 37, 25, C.ink, { font: "Courier New" });
      text("CIRCUIT-PRIVATE WITNESS", 790, 455, 426, 31, 18, C.orange, { bold: true });
      text("v, p, sv, sp", 790, 499, 426, 35, 24, C.ink);
      text("Valuation, principal and salts", 790, 536, 426, 35, 24, C.ink);
      text("Private to the circuit, visible to the oracle.", 790, 594, 426, 53, 21, C.gray);
    },
  },

  // 05 — APPLICATION BINDING
  {
    title: "Four signal checks bind each proof to contract state",
    kicker: "APPLICATION BINDING",
    source: "ProofEstate thesis, §§4.2, 6.1, 6.7; verifier implementation.",
    evidence: [
      "contracts/ComplianceVerifier.sol",
      "contracts/PropertyVerification.sol",
      "contracts/Lending.sol",
    ],
    notes: `A valid proof must also match the state used by the lending application.

The wrapper checks four signals before invoking the generated verifier. The property field must match the selected property identifier. The valuation commitment must match the current stored record. The principal commitment must match the value supplied to the wrapper, and the threshold must equal eight thousand.

Once all four checks pass and the proof verifies, the contract records compliance. Approval then checks that the stored principal commitment matches the loan request.

These checks reject substitution of the property, valuation, principal, or policy threshold. Freshness and loan-specific use require additional context, because the present statement contains no borrower, loan identifier, expiry, or deployment domain.`,
    draw: ({ text, rect, image, connect }) => {
      rect(64, 217, 1152, 52, C.blue);
      text("Public signal", 78, 231, 288, 24, 20, C.white, { bold: true });
      text("Required match", 394, 231, 451, 24, 20, C.white, { bold: true });
      text("Prevents", 873, 231, 329, 24, 20, C.white, { bold: true });
      text("k · propertyKeyField", 78, 285, 288, 43, 22, C.blue, { bold: true });
      text("propertyIdToField(propertyId)", 394, 285, 451, 43, 22, C.ink);
      text("Wrong-property substitution", 873, 285, 329, 43, 22, C.ink);
      rect(64, 344, 1152, 1, C.rule);
      text("Cv · valuationCommitment", 78, 360, 288, 43, 22, C.blue, { bold: true });
      text("Current stored valuation commitment", 394, 360, 451, 43, 22, C.ink);
      text("Different valuation context", 873, 360, 329, 43, 22, C.ink);
      rect(64, 419, 1152, 1, C.rule);
      text("Cp · principalCommitment", 78, 435, 288, 43, 22, C.blue, { bold: true });
      text("Submitted principal commitment", 394, 435, 451, 43, 22, C.ink);
      text("Different principal context", 873, 435, 329, 43, 22, C.ink);
      rect(64, 494, 1152, 1, C.rule);
      text("t · maxLtvBps", 78, 510, 288, 43, 22, C.blue, { bold: true });
      text("Fixed contract constant: 8000", 394, 510, 451, 43, 22, C.ink);
      text("Weaker-threshold substitution", 873, 510, 329, 43, 22, C.ink);
      rect(64, 569, 1152, 1, C.rule);
      text("All bindings match → Groth16 verifies → compliance is written.", 64, 590, 1152, 35, 25, C.blue, { bold: true });
      text("Lending later matches Cp to the requested loan at approval.", 64, 632, 1152, 29, 21, C.gray);
    },
  },

  // 06 — LENDING LIFECYCLE
  {
    title: "Compliance gates approval; locks govern the loan lifecycle",
    kicker: "LENDING LIFECYCLE",
    source: "ProofEstate thesis, §§3.4, 4.2; Lending contract.",
    evidence: [
      "contracts/Lending.sol",
    ],
    notes: `The demonstration follows property verification, proving, on-chain compliance, a loan request, approval, and repayment.

The contract checks different conditions at request and approval. A request requires the recorded owner, a nonzero principal commitment, and an available property lock. Approval requires the officer role, Requested state, current verification, and matching compliance.

Requested and approved loans hold the lock. Rejection, cancellation, and repayment release it. If verification or compliance fails during approval, the request becomes rejected and its lock is released.

This implements one active loan per property within the prototype. Repayment records the state change and releases the lock. Financial asset settlement and ownership revalidation at approval are future extensions.`,
    draw: ({ text, rect, image, connect }) => {
      text("Normal flow: verify property → prove → record compliance → request → approve → repay", 64, 196, 1152, 34, 21, C.gray);
      text("Request: recorded owner + nonzero Cp + no active loan", 64, 242, 1152, 34, 24, C.blue, { bold: true });
      text("Approval: officer role + Requested state + verified property + matching compliance", 64, 286, 1152, 34, 23, C.orange, { bold: true });
      rect(64, 359, 268, 104, C.white, { border: C.rule, name: "requested" });
      text("Requested", 82, 374, 232, 30, 23, C.blue, { bold: true });
      text("Lock held", 82, 410, 232, 39, 21, C.gray);
      rect(498, 359, 268, 104, C.orangeTint, { border: C.rule, name: "approved" });
      text("Approved", 516, 374, 232, 30, 23, C.blue, { bold: true });
      text("Lock held", 516, 410, 232, 39, 21, C.gray);
      rect(932, 359, 268, 104, C.white, { border: C.rule, name: "repaid" });
      text("Repaid", 950, 374, 232, 30, 23, C.blue, { bold: true });
      text("Lock released", 950, 410, 232, 39, 21, C.gray);
      rect(64, 543, 268, 104, C.white, { border: C.rule, name: "rejected" });
      text("Rejected", 82, 558, 232, 30, 23, C.blue, { bold: true });
      text("Lock released", 82, 594, 232, 39, 21, C.gray);
      rect(498, 543, 268, 104, C.white, { border: C.rule, name: "cancelled" });
      text("Cancelled", 516, 558, 232, 30, 23, C.blue, { bold: true });
      text("Lock released", 516, 594, 232, 39, 21, C.gray);
      connect("requested", "approved", "right", "left", "straight");
      connect("approved", "repaid", "right", "left", "straight");
      connect("requested", "rejected", "bottom", "top", "straight");
      connect("requested", "cancelled", "bottom", "top", "elbow");
      text("Approve", 353, 368, 124, 30, 20, C.blue, { bold: true, align: "center" });
      text("Repay", 786, 368, 126, 30, 20, C.blue, { bold: true, align: "center" });
      text("Reject / checks fail", 222, 511, 200, 29, 18, C.blue, { bold: true });
      text("Borrower cancels", 446, 511, 170, 29, 18, C.blue, { bold: true });
      text("Repayment records state;", 894, 555, 318, 29, 22, C.gray);
      text("no ETH / ERC20 settlement.", 894, 586, 318, 29, 22, C.gray);
    },
  },

  // 07 — PRODUCT EVIDENCE
  {
    title: "The DApp makes proof status and binding inspectable",
    kicker: "PRODUCT EVIDENCE",
    source: "ProofEstate thesis, §4.5 and Appendix C; local DApp capture.",
    evidence: [
      "docs/screenshots/03-zk-compliance-proof-verified.png",
    ],
    notes: `This is the compliance workspace from the local application.

The selected property is PROP-001, with a mock valuation of nine hundred and eighty thousand. The principal is seven hundred and fifty thousand, producing a displayed loan-to-value ratio of approximately seventy-six point five percent.

The workspace shows proof generation, the principal commitment, and whether the proof's public signals match the selected context. Users can inspect these results before proceeding with the loan workflow.

The displayed amounts are local mock inputs. They remain visible in the application even though the contracts omit financial plaintext. The contract and circuit tests separately verify the enforcement behavior behind this interface.`,
    draw: ({ text, rect, image, connect }) => {
      image("docs/screenshots/03-zk-compliance-proof-verified.png", 103.193, 209, 788.615, 439);
      text("76.5%", 968, 232, 248, 65, 44, C.blue, { bold: true });
      text("displayed LTV", 968, 302, 248, 30, 22, C.blue, { bold: true });
      text("Mock valuation: 980,000; principal: 750,000", 968, 340, 248, 43, 17, C.gray);
      text("Matched", 968, 424, 248, 65, 36, C.blue, { bold: true });
      text("proof binding", 968, 494, 248, 30, 22, C.blue, { bold: true });
      text("Public signals match the local contract context", 968, 532, 248, 43, 17, C.gray);
      text("Local mock-workflow capture", 968, 609, 248, 47, 19, C.orange, { bold: true });
    },
  },

  // 08 — PRODUCT EVIDENCE
  {
    title: "The loan ledger exposes context and lifecycle decisions",
    kicker: "PRODUCT EVIDENCE",
    source: "ProofEstate thesis, §§4.5, 5.7 and Appendix C; local loan ledger.",
    evidence: [
      "docs/screenshots/04-borrower-loan-lifecycle.png",
      "contracts/Lending.sol",
    ],
    notes: `The loan workspace presents each request together with its property, principal commitment, and lifecycle state.

This ledger contains several local loans and illustrates approval, rejection, cancellation, and repayment outcomes. Selecting a loan exposes its own details and proof binding.

The local command-line workflow separately exercises one complete sequence through to Repaid. Together, the interface and workflow evidence show how the implemented contracts can be operated and inspected.

Borrowers and officers use the application to submit actions, while the contracts enforce permissions and transitions. Repayment updates the recorded state and releases the property lock; asset transfer remains outside this implementation.`,
    draw: ({ text, rect, image, connect }) => {
      image("docs/screenshots/04-borrower-loan-lifecycle.png", 102.797, 209, 789.407, 439);
      text("Loan context", 968, 236, 248, 34, 26, C.blue, { bold: true });
      text("Property + principal commitment remain inspectable.", 968, 282, 248, 93, 23, C.gray);
      text("Lifecycle visibility", 968, 398, 248, 65, 26, C.blue, { bold: true });
      text("The ledger contains multiple local outcomes.", 968, 473, 248, 92, 23, C.gray);
      text("State transition only;", 968, 598, 248, 26, 21, C.orange, { bold: true });
      text("no asset transfer.", 968, 626, 248, 26, 21, C.orange, { bold: true });
    },
  },

  // 09 — EXPERIMENT DESIGN
  {
    title: "Four cases test the 80% limit and registry rejection",
    kicker: "EXPERIMENT DESIGN",
    source: "ProofEstate thesis, §§5.1–5.3; automated suites and local timing runs.",
    evidence: [
      "docs/benchmarks/final-benchmarks.md",
      "docs/evaluation-notes.md",
      "test/proofestate.test.js",
    ],
    notes: `The evaluation covers functional correctness, security and arithmetic boundaries, and local performance.

The automated suites contain thirty-seven contract and circuit tests, twelve oracle API tests, and six frontend component tests. They cover permissions, proof binding, loan transitions, input validation, and selected interface components.

The performance matrix uses four cases. PROP-001 has a valuation of nine hundred and eighty thousand, giving an exact eighty percent boundary of seven hundred and eighty-four thousand. We test a below-limit principal, the exact boundary, one unit above it, and an encumbered property.

Each timing case excludes five warm-ups and retains thirty measured iterations. Passing cases generate proofs; rejected cases skip proving. Direct circuit tests independently reject an over-limit witness. Functional suites use Node twenty-two, while the recorded performance environment uses Node twenty.`,
    draw: ({ text, rect, image, connect }) => {
      text("PROP-001 valuation: 980,000 → maximum principal: 784,000", 64, 207, 1152, 36, 26, C.blue, { bold: true });
      rect(64, 274, 1152, 52, C.blue);
      text("Case", 78, 288, 275, 24, 20, C.white, { bold: true });
      text("Principal / property", 381, 288, 314, 24, 20, C.white, { bold: true });
      text("Recorded proving behavior", 723, 288, 479, 24, 20, C.white, { bold: true });
      text("Compliant", 78, 342, 275, 30, 22, C.blue, { bold: true });
      text("750,000 / PROP-001", 381, 342, 314, 30, 22, C.ink);
      text("Proof generated", 723, 342, 479, 30, 22, C.ink);
      rect(64, 388, 1152, 1, C.rule);
      text("Exact 80% boundary", 78, 404, 275, 30, 22, C.blue, { bold: true });
      text("784,000 / PROP-001", 381, 404, 314, 30, 22, C.ink);
      text("Proof generated", 723, 404, 479, 30, 22, C.ink);
      rect(64, 450, 1152, 1, C.rule);
      text("One unit over", 78, 466, 275, 30, 22, C.blue, { bold: true });
      text("784,001 / PROP-001", 381, 466, 314, 30, 22, C.ink);
      text("Rejected; proving skipped", 723, 466, 479, 30, 22, C.ink);
      rect(64, 512, 1152, 1, C.rule);
      text("Registry failure", 78, 528, 275, 30, 22, C.blue, { bold: true });
      text("100,000 / PROP-004", 381, 528, 314, 30, 22, C.ink);
      text("Encumbered; proving skipped", 723, 528, 479, 30, 22, C.ink);
      rect(64, 574, 1152, 1, C.rule);
      rect(64, 592, 1152, 1, C.rule);
      text("37", 64, 608, 110, 50, 40, C.blue, { bold: true });
      text("contract + circuit tests", 187, 603, 300, 26, 20, C.ink);
      text("12 API + 6 frontend tests", 187, 631, 280, 26, 20, C.ink);
      text("5 warmups + 30 measured iterations per case", 518, 608, 698, 22, 19, C.gray);
      text("Node 20 timing; functional suites use Node 22.22.1", 518, 632, 698, 22, 19, C.gray);
    },
  },

  // 10 — LOCAL LATENCY
  {
    title: "Proving dominates the measured read-only compliance path",
    kicker: "LOCAL LATENCY",
    source: "ProofEstate thesis, §5.4, Table 12; 30-run local measurement, 25 Sep 2026.",
    evidence: [
      "docs/benchmarks/raw/local-2026-09-25T08-40-22-730Z.json",
    ],
    notes: `The main local cost is proof generation.

Median direct proving takes three hundred and ninety-nine point five three milliseconds. The read-only compliance endpoint takes four hundred and nine point one six milliseconds, and read-only property verification takes five point nine eight milliseconds.

The ninety-fifth percentiles are four hundred and sixty-nine point five three milliseconds for proving and four hundred and eighty point three milliseconds for compliance.

These summaries use thirty measured observations after warm-up, with nearest-rank quantiles. Blockchain submission and confirmation are excluded.

Direct proving and the compliance endpoint invoke the prover separately, so subtracting their medians would not isolate API overhead. The results characterize sequential execution in the local measurement environment; concurrency and public-chain latency are future evaluation targets.`,
    draw: ({ text, rect, image, connect }) => {
      text("Read-only /compliance", 64, 223, 652, 31, 24, C.blue, { bold: true });
      rect(64, 266, 534, 29, C.orange);
      text("409.16 ms", 613, 263, 184, 38, 24, C.orange, { bold: true });
      text("Direct Groth16 proof", 64, 335, 652, 31, 24, C.blue, { bold: true });
      rect(64, 378, 521, 29, C.blue);
      text("399.53 ms", 600, 375, 184, 38, 24, C.blue, { bold: true });
      text("Read-only /verify", 64, 447, 652, 31, 24, C.blue, { bold: true });
      rect(64, 490, 8, 29, C.gray);
      text("5.98 ms", 87, 487, 184, 38, 24, C.gray, { bold: true });
      rect(64, 575, 652, 1, C.rule);
      text("0", 64, 588, 100, 28, 18, C.gray);
      text("250", 343, 588, 100, 28, 18, C.gray, { align: "center" });
      text("500 ms", 616, 588, 100, 28, 18, C.gray, { align: "right" });
      text("P95", 904, 229, 304, 36, 25, C.blue, { bold: true });
      text("Proof: 469.53 ms", 904, 284, 304, 41, 26, C.ink);
      text("API: 480.30 ms", 904, 327, 304, 41, 26, C.ink);
      text("n = 30 · local sequential runs", 904, 398, 304, 64, 22, C.gray);
      text("Independent proof calls;", 904, 503, 304, 58, 22, C.orange, { bold: true });
      text("median difference does not measure API overhead.", 904, 563, 304, 58, 22, C.orange, { bold: true });
      text("API timings exclude blockchain submission and confirmation.", 64, 630, 803, 28, 21, C.gray);
    },
  },

  // 11 — ON-CHAIN COST
  {
    title: "Full compliance processing averages 310,411 gas",
    kicker: "ON-CHAIN COST",
    source: "ProofEstate thesis, §5.5, Table 15; measured transaction workload, Node 20.",
    evidence: [
      "docs/evaluation-notes.md",
    ],
    notes: `The complete compliance operation averages three hundred and ten thousand, four hundred and eleven gas in the measured workload.

That includes public-signal checks, the generated verifier call, state writes, and events. Requesting a loan averages two hundred and thirty-three thousand, six hundred and nine gas. Approval averages eighty-one thousand, four hundred and sixty-four, and repayment averages fifty-seven thousand, two hundred and nineteen.

The gas reporter aggregates calls across storage states and outcomes, including approval attempts that reject a request. These averages describe the evaluated workload rather than a fixed cost for every successful call.

The compliance operation is the most expensive of these methods. Isolating the cryptographic verifier's cost would require separate instrumentation.`,
    draw: ({ text, rect, image, connect }) => {
      text("verifyProofAndSetCompliance", 64, 219, 666, 30, 24, C.blue, { bold: true });
      rect(64, 258, 556, 27, C.orange);
      text("310,411", 635, 253, 164, 40, 24, C.orange, { bold: true });
      text("requestLoan", 64, 311, 666, 30, 24, C.blue, { bold: true });
      rect(64, 350, 418, 27, C.blue);
      text("233,609", 497, 345, 164, 40, 24, C.blue, { bold: true });
      text("approveLoan", 64, 403, 666, 30, 24, C.blue, { bold: true });
      rect(64, 442, 146, 27, C.blue);
      text("81,464", 225, 437, 164, 40, 24, C.blue, { bold: true });
      text("repay", 64, 495, 666, 30, 24, C.blue, { bold: true });
      rect(64, 534, 103, 27, C.gray);
      text("57,219", 182, 529, 164, 40, 24, C.gray, { bold: true });
      text("Whole compliance operation", 891, 223, 325, 70, 30, C.blue, { bold: true });
      text("Signal checks", 891, 327, 325, 41, 25, C.ink);
      text("Generated verifier", 891, 370, 325, 41, 25, C.ink);
      text("State writes + events", 891, 413, 325, 41, 25, C.ink);
      text("Measured Node 20 workload", 891, 487, 325, 66, 21, C.gray);
      text("Mixed storage states and approval outcomes.", 891, 555, 325, 66, 21, C.gray);
      text("These are gas units, not isolated verifier cost or transaction fees.", 64, 630, 823, 28, 21, C.orange, { bold: true });
    },
  },

  // 12 — PRIVACY BOUNDARY
  {
    title: "Financial plaintext stays off chain; the API exposes inputs",
    kicker: "PRIVACY BOUNDARY",
    source: "ProofEstate thesis, §§3.5, 6.6, 6.8; oracle API and registry implementation.",
    evidence: [
      "backend/oracle/server.js",
      "backend/oracle/service.js",
      "backend/oracle/properties.js",
    ],
    notes: `The privacy analysis distinguishes the public blockchain from the application that supplies the proof.

The chain records property identifiers, owner addresses, commitments, proofs, and lifecycle state. Valuation and principal plaintext are omitted from those transaction interfaces and records.

The oracle API, however, returns witness values and salts without caller authentication. The mock registry is also available in the repository. The valuation salt is deterministic, allowing an observer with the relevant context to test candidate valuations against the commitment.

The implemented privacy result is omission of financial plaintext from the chain. Confidential service operation would also require authenticated access, restricted responses, and secret valuation blinding across the registry and proving path.`,
    draw: ({ text, rect, image, connect }) => {
      rect(64, 219, 1152, 52, C.blue);
      text("Boundary", 78, 233, 231, 24, 20, C.white, { bold: true });
      text("What is visible", 337, 233, 455, 24, 20, C.white, { bold: true });
      text("Supported conclusion", 820, 233, 382, 24, 20, C.white, { bold: true });
      text("Public blockchain", 78, 287, 231, 67, 23, C.blue, { bold: true });
      text("Identifiers, owner, commitments, proofs and lifecycle state", 337, 287, 455, 67, 23, C.ink);
      text("Valuation / principal plaintext omitted", 820, 287, 382, 67, 23, C.ink);
      rect(64, 370, 1152, 1, C.rule);
      rect(64, 370, 1152, 99, C.orangeTint);
      text("Oracle + current API", 78, 386, 231, 67, 23, C.blue, { bold: true });
      text("Valuation, principal, witness inputs and salts", 337, 386, 455, 67, 23, C.ink);
      text("Application confidentiality is not established", 820, 386, 382, 67, 23, C.ink);
      rect(64, 469, 1152, 1, C.rule);
      text("Mock registry / blinding", 78, 485, 231, 67, 23, C.blue, { bold: true });
      text("Public property values; deterministic valuation salt", 337, 485, 455, 67, 23, C.ink);
      text("Candidate valuation testing remains possible", 820, 485, 382, 67, 23, C.ink);
      rect(64, 568, 1152, 1, C.rule);
      text("Witness protection requires controls across the registry, API and proving service.", 64, 600, 1152, 56, 26, C.blue, { bold: true });
    },
  },

  // 13 — SECURITY FINDINGS
  {
    title: "Tests reveal four proof-lifecycle limits",
    kicker: "SECURITY FINDINGS",
    source: "ProofEstate thesis, §6.5, Table 23; integrated security-boundary tests.",
    evidence: [
      "test/proofestate.test.js",
    ],
    notes: `The security tests identify four limits in the proof lifecycle.

First, refreshing a property while retaining its valuation commitment clears compliance, but the same proof can restore it. State reset alone does not enforce freshness.

Second, an authorized owner update after a request can leave the original request approvable when the valuation commitment is retained and compliance is restored. Ownership is checked at request time.

Third, a valid proof for another principal replaces the property's single compliance record. The previous pending request is then rejected and its lock released.

Fourth, clearing compliance after approval leaves the approved state and active lock in place. Approval records a decision at that moment.

These results identify concrete requirements for proof freshness, ownership continuity, independent loan records, and revalidation after approval.`,
    draw: ({ text, rect, image, connect }) => {
      rect(64, 214, 1152, 52, C.blue);
      text("Tested change", 78, 228, 274, 24, 20, C.white, { bold: true });
      text("Observed behavior", 380, 228, 450, 24, 20, C.white, { bold: true });
      text("Security implication", 858, 228, 344, 24, 20, C.white, { bold: true });
      text("Refresh; unchanged Cv", 78, 282, 274, 52, 22, C.blue, { bold: true });
      text("Identical proof restores cleared compliance", 380, 282, 450, 52, 22, C.ink);
      text("Reset does not imply freshness", 858, 282, 344, 52, 22, C.ink);
      rect(64, 350, 1152, 1, C.rule);
      text("Owner changes after request", 78, 366, 274, 52, 22, C.blue, { bold: true });
      text("Original request can still be approved", 380, 366, 450, 52, 22, C.ink);
      text("Owner is not rechecked at approval", 858, 366, 344, 52, 22, C.ink);
      rect(64, 434, 1152, 1, C.rule);
      text("Another principal replaces Cp", 78, 450, 274, 52, 22, C.blue, { bold: true });
      text("Old pending request rejected; lock released", 380, 450, 450, 52, 22, C.ink);
      text("One mutable compliance slot per property", 858, 450, 344, 52, 22, C.ink);
      rect(64, 518, 1152, 1, C.rule);
      text("Refresh after approval", 78, 534, 274, 52, 22, C.blue, { bold: true });
      text("Approved state and active lock remain", 380, 534, 450, 52, 22, C.ink);
      text("Approval is a snapshot decision", 858, 534, 344, 52, 22, C.ink);
      rect(64, 602, 1152, 1, C.rule);
      text("Freshness, ownership continuity and loan isolation require explicit lifecycle controls.", 64, 612, 1152, 47, 22, C.orange, { bold: true });
    },
  },

  // 14 — RESEARCH PRIORITIES
  {
    title: "Protect witnesses and bind proofs to loan context",
    kicker: "FUTURE WORK",
    source: "ProofEstate thesis, §§8.1–8.3.",
    evidence: [
      "docs/limitations-and-extensions.md",
    ],
    notes: `The findings lead to three priorities for future work.

First, protect witness delivery through authenticated callers, restricted API responses, and secret randomness for valuation blinding.

Second, strengthen the proof lifecycle. This means binding proofs to the loan context and a nonce or version, revalidating ownership at approval, and defining replacement and revocation rules.

Third, improve source assurance and evaluation through signed registry attestations, a documented setup ceremony, matched performance baselines, and measurements under concurrent and public-chain workloads.

These changes would strengthen confidentiality and the guarantees around each approval. Identity policies, asset settlement, and liquidation can then extend the lending workflow.`,
    draw: ({ text, rect, image, connect }) => {
      text("01", 64, 223, 112, 78, 58, C.orange, { bold: true });
      text("Protect witness delivery", 203, 227, 1004, 38, 29, C.blue, { bold: true });
      text("Authenticate callers; restrict API responses; use secret valuation blinding.", 203, 277, 1004, 67, 24, C.gray);
      rect(203, 342, 1013, 1, C.rule);
      text("02", 64, 352, 112, 78, 58, C.blue, { bold: true });
      text("Define proof lifecycle", 203, 356, 1004, 38, 29, C.blue, { bold: true });
      text("Bind loan and nonce/version; recheck ownership; define revocation.", 203, 406, 1004, 67, 24, C.gray);
      rect(203, 471, 1013, 1, C.rule);
      text("03", 64, 481, 112, 78, 58, C.blue, { bold: true });
      text("Strengthen source assurance and evaluation", 203, 485, 1004, 38, 29, C.blue, { bold: true });
      text("Signed registry attestations; audited setup; matched baselines and concurrent workloads.", 203, 535, 1004, 67, 24, C.gray);
      text("Broader extensions: identity policies, real settlement, liquidation and operational governance.", 64, 627, 1152, 30, 21, C.gray);
    },
  },

  // 15 — CONCLUSION
  {
    title: "Bound proofs support auditable loan approval",
    kicker: "CONCLUSION",
    source: "ProofEstate thesis, §§6.1, 9; implementation and evaluation.",
    evidence: [
      "test/proofestate.test.js",
      "docs/benchmarks/final-benchmarks.md",
    ],
    notes: `ProofEstate demonstrates an implemented path from a private loan-to-value relation to an auditable lending decision.

The circuit proves the committed values satisfy the eighty percent rule. The wrapper matches the proof to the property, current valuation, principal commitment, and policy, and the lending contract checks that compliance at approval.

The evaluation establishes the local workflow, measured costs, and specific security boundaries. The result provides a reproducible basis for extending witness protection, proof freshness, and ownership continuity under the stated oracle, setup, commitment, and role assumptions.

I will now show a recorded demonstration of the local workflow.

The source code and web demonstration are available through the links on this slide. Thank you for your attention. I welcome your questions.`,
    draw: ({ text, rect, image, connect }) => {
      text("An implemented binding pattern with tested security boundaries.", 64, 224, 1152, 44, 28, C.gray);
      text("Under explicit oracle, proof-system, commitment and role assumptions.", 64, 276, 1152, 34, 20, C.gray);
      text("Thank you.", 64, 365, 1152, 84, 64, C.blue, { bold: true });
      text("Questions & discussion", 64, 461, 1152, 44, 30, C.orange);
      rect(64, 545, 1152, 1, C.rule);
      text("SOURCE CODE", 64, 565, 544, 24, 14, C.orange, { bold: true });
      text("WEB DEMO", 672, 565, 544, 24, 14, C.orange, { bold: true });
      text(REPOSITORY_URL, 64, 599, 544, 34, 23, C.blue,
        { href: REPOSITORY_URL, name: "repository-link" });
      text(DEMO_URL, 672, 599, 544, 34, 23, C.blue,
        { href: DEMO_URL, name: "demo-link" });
    },
  }

];

async function loadRuntime() {
  if (!process.env.ARTIFACT_TOOL_PATH) {
    try {
      const [artifact, runtime] = await Promise.all([
        import("@oai/artifact-tool"),
        import("@oai/artifact-tool/presentation-jsx/jsx-runtime"),
      ]);
      return { ...artifact, jsx: runtime.jsx };
    } catch (error) {
      if (error.code !== "ERR_MODULE_NOT_FOUND") throw error;
    }
  }
  const directory = process.env.ARTIFACT_TOOL_PATH
    ? path.resolve(process.env.ARTIFACT_TOOL_PATH)
    : path.join(os.homedir(), ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool");
  let metadata;
  try {
    metadata = JSON.parse(await fs.readFile(path.join(directory, "package.json"), "utf8"));
  } catch (error) {
    throw new Error("Presentation runtime unavailable. Use the Codex-bundled @oai/artifact-tool, or set ARTIFACT_TOOL_PATH to its package directory. See README.md.", { cause: error });
  }
  const [major, minor, patch] = metadata.version.split(".").map(Number);
  if (metadata.name !== "@oai/artifact-tool" ||
      major < 2 || (major === 2 && (minor < 7 || (minor === 7 && patch < 3)))) {
    throw new Error("The presentation builder requires @oai/artifact-tool >= 2.7.3.");
  }
  function exportedFile(key) {
    const entry = metadata.exports[key];
    const relative = typeof entry === "string" ? entry : entry?.import || entry?.default || entry?.node;
    if (!relative) throw new Error(`Missing presentation runtime export: ${key}`);
    return pathToFileURL(path.join(directory, relative)).href;
  }
  const [artifact, runtime] = await Promise.all([
    import(exportedFile(".")), import(exportedFile("./presentation-jsx/jsx-runtime")),
  ]);
  return { ...artifact, jsx: runtime.jsx };
}

function applyTheme(presentation) {
  const theme = presentation.theme.toProto();
  theme.name = "ProofEstate NUS";
  theme.colorScheme.name = "NUS Blue and Orange";
  const palette = {
    accent1: C.blue, accent2: C.orange, accent3: C.navy, accent4: C.gray,
    accent5: C.rule, accent6: C.orangeTint, bg1: C.white, bg2: C.blue,
    tx1: C.ink, tx2: C.white, dk1: C.ink, lt1: C.white,
    dk2: C.navy, lt2: C.blueTint, hlink: C.blue, folHlink: C.blue,
  };
  for (const entry of theme.colorScheme.colors) {
    if (palette[entry.name]) entry.color.value = palette[entry.name].slice(1);
  }
  presentation.theme.replaceFromProto(theme);
}

function drawingTools(slide, jsx, assets) {
  let sequence = 0;
  const nodes = new Map();
  function compose(type, props, left, top, width, height) {
    return slide.compose(jsx(type, { ...props, width: "fill", height: "fill" }), {
      frame: { left, top, width, height }, baseUnit: 1,
    })[0];
  }
  return {
    text(value, x, y, w, h, size, color = C.ink, options = {}) {
      return compose("text", {
        name: options.name || `text-${++sequence}`,
        style: {
          fontSize: size, typeface: options.font || "Arial", color,
          bold: options.bold || false, alignment: options.align || "left",
          anchor: options.anchor === "ctr" ? 2 : 1,
          wrap: "square", autoFit: "none",
          insets: { left: 0, right: 0, top: 0, bottom: 0 },
        },
        children: options.href
          ? jsx("run", { link: { uri: options.href, isExternal: true, action: "" }, children: value })
          : value,
      }, x, y, w, h);
    },
    rect(x, y, w, h, fill, options = {}) {
      const name = options.name || `rect-${++sequence}`;
      const shape = compose("shape", {
        name, geometry: "rect", fill,
        line: { style: "solid", width: options.border ? options.borderWidth || 1 : 0,
          fill: options.border || fill },
      }, x, y, w, h);
      nodes.set(name, shape);
      return shape;
    },
    image(file, x, y, w, h) {
      const image = slide.images.add({
        dataUrl: assets.get(file), fit: "contain",
        name: path.basename(file, path.extname(file)),
        alt: file === LOGO ? "National University of Singapore" : "ProofEstate local mock DApp capture",
      });
      image.position = { left: x, top: y, width: w, height: h };
      return image;
    },
    connect(from, to, fromSide, toSide, kind = "straight") {
      const source = nodes.get(from), target = nodes.get(to);
      if (!source || !target) throw new Error(`Unknown diagram node: ${from} → ${to}`);
      return slide.shapes.connect(source, target, {
        name: `${from}-to-${to}`, kind, fromSide, toSide,
        line: { style: "solid", fill: C.orange, width: 2.5 },
        // Artifact Tool's tail is the destination end of an attached connector.
        tail: { type: "arrow", width: "med", length: "med" },
      });
    },
  };
}

function addChrome(tools, definition, index) {
  const { text, rect, image } = tools;
  const cover = index === 0;
  rect(64, cover ? 53 : 48, 6, 16, C.orange, { name: "kicker-marker" });
  text(definition.kicker, 84, cover ? 46 : 41, cover ? 850 : 960, 30,
    14, C.orange, { bold: true, anchor: "ctr", name: "kicker-label" });
  if (!cover) text(definition.title, 64, 88, 1152, 108, 40, C.blue,
    { bold: true, name: "slide-title" });
  if (cover) image(LOGO, 1042, 42.023, 174, 82.953);
  else image(LOGO, 1088.024, 24, 127.951, 61);
  rect(64, 665, 1152, 1, C.rule);
  text(`Source: ${definition.source}`, 64, 679, 1035, 23, 11, C.gray, { name: "source-footer" });
  text(`${String(index + 1).padStart(2, "0")} / ${DECK.length}`, 1132, 678, 84, 25,
    12, C.blue, { bold: true, align: "right", name: "page-number" });
}

async function build({ out, previewDir }) {
  // Fail before replacing the deck if an evidence file or required image is missing.
  const evidence = new Set(["thesis/thesis.md", LOGO, ...DECK.flatMap(slide => slide.evidence)]);
  await Promise.all([...evidence].map(file => fs.access(path.join(ROOT, file))));
  const assets = new Map();
  for (const file of [...evidence].filter(file => /\.png$/i.test(file))) {
    assets.set(file, `data:image/png;base64,${(await fs.readFile(path.join(ROOT, file))).toString("base64")}`);
  }
  const { Presentation, PresentationFile, jsx } = await loadRuntime();
  const presentation = Presentation.create({ slideSize: SIZE });
  applyTheme(presentation);
  for (const [index, definition] of DECK.entries()) {
    const slide = presentation.slides.add();
    slide.background.fill = C.white;
    const tools = drawingTools(slide, jsx, assets);
    addChrome(tools, definition, index);
    definition.draw(tools);
    slide.speakerNotes.setText(definition.notes);
  }
  if (previewDir) {
    await fs.mkdir(previewDir, { recursive: true });
    for (const [index, slide] of presentation.slides.items.entries()) {
      const stem = path.join(previewDir, `slide-${String(index + 1).padStart(2, "0")}`);
      const png = await presentation.export({ slide, format: "png", scale: 1 });
      const layout = await presentation.export({ slide, format: "layout" });
      await fs.writeFile(`${stem}.png`, new Uint8Array(await png.arrayBuffer()));
      await fs.writeFile(`${stem}.layout.json`, await layout.text());
    }
  }
  await fs.mkdir(path.dirname(out), { recursive: true });
  const pptx = await PresentationFile.exportPptx(presentation);
  await pptx.save(out);
  console.log(`Built ${DECK.length} editable slides with ${DECK.length} read-aloud Notes: ${path.relative(ROOT, out)}`);
}

const { values } = parseArgs({
  options: { out: { type: "string" }, "preview-dir": { type: "string" }, help: { type: "boolean" } },
});
if (values.help) {
  console.log("Usage: pnpm thesis:slides [--out <file.pptx>] [--preview-dir <directory>]\nRequires Codex-bundled @oai/artifact-tool >= 2.7.3; optionally set ARTIFACT_TOOL_PATH.");
} else {
  const out = values.out ? path.resolve(values.out) : path.join(ROOT, "slides/proofestate-nus-defense-presentation.pptx");
  if (!out.endsWith(".pptx")) throw new Error("--out must be a .pptx file.");
  await build({ out, previewDir: values["preview-dir"] && path.resolve(values["preview-dir"]) });
}
