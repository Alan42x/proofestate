import fs from "fs";
import os from "os";
import path from "path";
import { execFileSync } from "child_process";
import { createRequire } from "module";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const snarkjs = require("snarkjs");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, "..");
const buildDir = path.join(projectRoot, "zk", "build");
const artifactDir = path.join(projectRoot, "zk", "artifacts");
const generatedDir = path.join(projectRoot, "contracts", "generated");
const circuitPath = path.join(projectRoot, "circuits", "ltv.circom");
const cargoCircomPath = path.join(os.homedir(), ".cargo", "bin", "circom");
const circomBin = process.env.CIRCOM_BIN || (fs.existsSync(cargoCircomPath) ? cargoCircomPath : "circom");
const r1csPath = path.join(buildDir, "ltv.r1cs");
const wasmPath = path.join(buildDir, "ltv_js", "ltv.wasm");
const zkeyPath = path.join(artifactDir, "ltv_final.zkey");
const verificationKeyPath = path.join(artifactDir, "verification_key.json");
const snarkjsBin = path.join(projectRoot, "node_modules", ".bin", "snarkjs");
const powersOfTau = 13;

function run(command, args, options = {}) {
  execFileSync(command, args, {
    cwd: projectRoot,
    stdio: "inherit",
    ...options
  });
}

function ensureCircom() {
  run(circomBin, ["--version"]);
}

function compileCircuit() {
  ensureCircom();
  fs.rmSync(buildDir, { recursive: true, force: true });
  fs.mkdirSync(buildDir, { recursive: true });
  fs.mkdirSync(artifactDir, { recursive: true });

  run(circomBin, [
    circuitPath,
    "--r1cs",
    "--wasm",
    "--sym",
    "-l",
    path.join(projectRoot, "node_modules"),
    "-o",
    buildDir
  ]);

  fs.copyFileSync(r1csPath, path.join(artifactDir, "ltv.r1cs"));
}

function setupGroth16() {
  if (!fs.existsSync(r1csPath)) {
    compileCircuit();
  }

  fs.mkdirSync(artifactDir, { recursive: true });
  fs.mkdirSync(generatedDir, { recursive: true });

  for (const fileName of [
    "pot12_0000.ptau",
    "pot12_0001.ptau",
    "pot12_final.ptau",
    `pot${powersOfTau}_0000.ptau`,
    `pot${powersOfTau}_0001.ptau`,
    `pot${powersOfTau}_final.ptau`,
    "ltv_0000.zkey",
    "ltv_final.zkey",
    "verification_key.json"
  ]) {
    fs.rmSync(path.join(artifactDir, fileName), { force: true });
  }

  run(snarkjsBin, [
    "powersoftau",
    "new",
    "bn128",
    String(powersOfTau),
    path.join(artifactDir, `pot${powersOfTau}_0000.ptau`)
  ]);
  run(snarkjsBin, [
    "powersoftau",
    "contribute",
    path.join(artifactDir, `pot${powersOfTau}_0000.ptau`),
    path.join(artifactDir, `pot${powersOfTau}_0001.ptau`),
    "--name=ProofEstate local ceremony",
    "-e=proofestate circom ltv"
  ]);
  run(snarkjsBin, [
    "powersoftau",
    "prepare",
    "phase2",
    path.join(artifactDir, `pot${powersOfTau}_0001.ptau`),
    path.join(artifactDir, `pot${powersOfTau}_final.ptau`)
  ]);
  run(snarkjsBin, [
    "groth16",
    "setup",
    r1csPath,
    path.join(artifactDir, `pot${powersOfTau}_final.ptau`),
    path.join(artifactDir, "ltv_0000.zkey")
  ]);
  run(snarkjsBin, [
    "zkey",
    "contribute",
    path.join(artifactDir, "ltv_0000.zkey"),
    zkeyPath,
    "--name=ProofEstate final contribution",
    "-e=proofestate final ltv verifier"
  ]);
  run(snarkjsBin, ["zkey", "export", "verificationkey", zkeyPath, verificationKeyPath]);

  const verifierPath = path.join(generatedDir, "LtvGroth16Verifier.sol");
  run(snarkjsBin, ["zkey", "export", "solidityverifier", zkeyPath, verifierPath]);

  const generated = fs
    .readFileSync(verifierPath, "utf8")
    .replace("contract Groth16Verifier", "contract LtvGroth16Verifier");
  fs.writeFileSync(verifierPath, generated);
}

async function proveSample() {
  if (!fs.existsSync(wasmPath) || !fs.existsSync(zkeyPath)) {
    compileCircuit();
    setupGroth16();
  }

  const { buildCompliance } = require("../backend/oracle/properties");
  const { generateComplianceProof } = require("../zk/prover");
  const compliance = await buildCompliance("PROP-001", 750000n, 123456789n);
  const generated = await generateComplianceProof(compliance.proofInputs);
  const verificationKey = JSON.parse(fs.readFileSync(verificationKeyPath, "utf8"));
  const verified = await snarkjs.groth16.verify(
    verificationKey,
    generated.publicSignals,
    generated.proof
  );

  if (!verified) {
    throw new Error("Generated sample proof failed snarkjs verification");
  }

  console.log("Sample Circom Groth16 proof verified with snarkjs.");
}

async function main() {
  const command = process.argv[2] || "build";

  if (command === "compile") {
    compileCircuit();
    return;
  }

  if (command === "setup") {
    setupGroth16();
    return;
  }

  if (command === "prove") {
    await proveSample();
    return;
  }

  if (command !== "build") {
    throw new Error(`Unknown zk-build command: ${command}`);
  }

  compileCircuit();
  setupGroth16();
  await proveSample();
  console.log("Generated Circom Groth16 artifacts in zk/build, zk/artifacts, and contracts/generated.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
