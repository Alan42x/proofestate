const fs = require("fs");
const path = require("path");
const snarkjs = require("snarkjs");
const { toCircuitInput } = require("./ltvCircuit");

const PROJECT_ROOT = path.join(__dirname, "..");
const BUILD_DIR = path.join(__dirname, "build");
const ARTIFACT_DIR = path.join(__dirname, "artifacts");
const WASM_PATH = path.join(BUILD_DIR, "ltv_js", "ltv.wasm");
const ZKEY_PATH = path.join(ARTIFACT_DIR, "ltv_final.zkey");

function parseSolidityCallData(calldata) {
  const [a, b, c, publicSignals] = JSON.parse(`[${calldata}]`);
  return { a, b, c, publicSignals };
}

function assertFileExists(filePath, hint) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing ${hint} at ${path.relative(PROJECT_ROOT, filePath)}. Run pnpm zk:build first.`);
  }
}

async function generateComplianceProof(inputs, { wasmPath = WASM_PATH, zkeyPath = ZKEY_PATH } = {}) {
  assertFileExists(wasmPath, "Circom witness wasm");
  assertFileExists(zkeyPath, "Groth16 proving key");

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    toCircuitInput(inputs),
    wasmPath,
    zkeyPath
  );
  const calldata = await snarkjs.groth16.exportSolidityCallData(proof, publicSignals);

  return {
    proof,
    publicSignals: publicSignals.map((signal) => signal.toString()),
    solidity: parseSolidityCallData(calldata)
  };
}

module.exports = {
  BUILD_DIR,
  ARTIFACT_DIR,
  WASM_PATH,
  ZKEY_PATH,
  generateComplianceProof
};
