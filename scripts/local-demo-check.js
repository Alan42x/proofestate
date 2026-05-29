require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

const rootDir = path.join(__dirname, "..");
const deploymentPath = path.join(rootDir, "deployments", "localhost.json");
const frontendEnvPath = path.join(rootDir, "frontend", ".env");
const strict = process.argv.includes("--strict");

function readEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .reduce((acc, line) => {
      const index = line.indexOf("=");
      if (index > 0 && !line.trimStart().startsWith("#")) {
        acc[line.slice(0, index)] = line.slice(index + 1);
      }
      return acc;
    }, {});
}

async function checkRpc() {
  const rpcUrl = process.env.LOCAL_RPC_URL || "http://127.0.0.1:8545";
  const blockNumber = await rpc(rpcUrl, "eth_blockNumber");
  return { ok: true, detail: `block ${Number(blockNumber)}` };
}

async function checkOracle() {
  const port = process.env.ORACLE_PORT || "8787";
  const response = await fetch(`http://127.0.0.1:${port}/health`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const body = await response.json();
  return { ok: body.ok === true, detail: body.service || "oracle" };
}

async function checkDeployment() {
  if (!fs.existsSync(deploymentPath)) {
    throw new Error("missing deployments/localhost.json");
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  const rpcUrl = process.env.LOCAL_RPC_URL || "http://127.0.0.1:8545";
  const addresses = [
    ["PropertyVerification", deployment.propertyVerification],
    ["LtvGroth16Verifier", deployment.ltvGroth16Verifier],
    ["ComplianceVerifier", deployment.complianceVerifier],
    ["Lending", deployment.lending]
  ];

  for (const [name, address] of addresses) {
    if (!address || !ethers.isAddress(address)) {
      throw new Error(`${name} address is missing or invalid`);
    }
    const code = await rpc(rpcUrl, "eth_getCode", [address, "latest"]);
    if (code === "0x") {
      throw new Error(`${name} has no code at ${address}`);
    }
  }

  return { ok: true, detail: addresses.map(([name]) => name).join(", ") };
}

async function checkFrontendEnv() {
  const env = readEnv(frontendEnvPath);
  const required = [
    "VITE_ORACLE_API_URL",
    "VITE_LOCAL_RPC_URL",
    "VITE_PROPERTY_VERIFICATION_ADDRESS",
    "VITE_COMPLIANCE_VERIFIER_ADDRESS",
    "VITE_LENDING_ADDRESS",
    "VITE_DEFAULT_NETWORK"
  ];
  const missing = required.filter((key) => !env[key]);
  if (missing.length) {
    throw new Error(`missing ${missing.join(", ")}`);
  }
  return { ok: true, detail: "frontend/.env ready" };
}

async function runCheck(name, fn) {
  try {
    const result = await fn();
    console.log(`OK   ${name}: ${result.detail}`);
    return true;
  } catch (error) {
    console.log(`FAIL ${name}: ${error.message}`);
    return false;
  }
}

async function rpc(url, method, params = []) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1600);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method,
        params
      }),
      signal: controller.signal
    });
    const body = await response.json();
    if (!response.ok || body.error) {
      throw new Error(body.error?.message || `HTTP ${response.status}`);
    }
    return body.result;
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  const results = await Promise.all([
    runCheck("local RPC", checkRpc),
    runCheck("oracle API", checkOracle),
    runCheck("deployment", checkDeployment),
    runCheck("frontend env", checkFrontendEnv)
  ]);

  const ok = results.every(Boolean);
  if (!ok || strict) {
    process.exitCode = ok ? 0 : 1;
  }
}

main();
