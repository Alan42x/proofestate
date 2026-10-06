const fs = require("fs");
const path = require("path");

const HARDHAT_ACCOUNT_0_PRIVATE_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const HARDHAT_ACCOUNT_1_PRIVATE_KEY =
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

const rootDir = path.join(__dirname, "../..");
const deploymentPath = path.join(rootDir, "deployments", "localhost.json");
const rootEnvPath = path.join(
  rootDir,
  process.env.PROOFESTATE_ENV_FILE || process.env.DOTENV_CONFIG_PATH || ".env.local"
);
const frontendEnvPath = path.join(rootDir, "frontend", ".env.local");

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

function writeEnv(filePath, values) {
  const current = readEnv(filePath);
  const merged = { ...current, ...values };
  const orderedKeys = Object.keys(merged).sort((a, b) => {
    const order = [
      "LOCAL_RPC_URL",
      "ORACLE_PORT",
      "ORACLE_PRIVATE_KEY",
      "DEPLOYER_PRIVATE_KEY",
      "ADMIN_ADDRESS",
      "ORACLE_ADDRESS",
      "LOAN_OFFICER_ADDRESS",
      "PROPERTY_VERIFICATION_ADDRESS",
      "LTV_GROTH16_VERIFIER_ADDRESS",
      "COMPLIANCE_VERIFIER_ADDRESS",
      "LENDING_ADDRESS",
      "ROLE_ADMIN_MANAGER_ADDRESS",
      "SEPOLIA_RPC_URL",
      "VITE_ORACLE_API_URL",
      "VITE_LOCAL_RPC_URL",
      "VITE_SEPOLIA_RPC_URL",
      "VITE_ADMIN_ADDRESS",
      "VITE_ORACLE_ADDRESS",
      "VITE_LOAN_OFFICER_ADDRESS",
      "VITE_PROPERTY_VERIFICATION_ADDRESS",
      "VITE_LTV_GROTH16_VERIFIER_ADDRESS",
      "VITE_COMPLIANCE_VERIFIER_ADDRESS",
      "VITE_LENDING_ADDRESS",
      "VITE_ROLE_ADMIN_MANAGER_ADDRESS",
      "VITE_DEFAULT_NETWORK"
    ];
    const aIndex = order.indexOf(a);
    const bIndex = order.indexOf(b);
    const normalizedA = aIndex === -1 ? Number.MAX_SAFE_INTEGER : aIndex;
    const normalizedB = bIndex === -1 ? Number.MAX_SAFE_INTEGER : bIndex;
    return normalizedA - normalizedB || a.localeCompare(b);
  });

  fs.writeFileSync(
    filePath,
    `${orderedKeys.map((key) => `${key}=${merged[key]}`).join("\n")}\n`
  );
}

function main() {
  if (!fs.existsSync(deploymentPath)) {
    throw new Error("Missing deployments/localhost.json. Run pnpm demo:deploy after starting pnpm chain:local.");
  }

  const frontendEnv = readEnv(frontendEnvPath);
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  const shared = {
    LOCAL_RPC_URL: "http://127.0.0.1:8545",
    PROPERTY_VERIFICATION_ADDRESS: deployment.propertyVerification,
    LTV_GROTH16_VERIFIER_ADDRESS: deployment.ltvGroth16Verifier || "",
    COMPLIANCE_VERIFIER_ADDRESS: deployment.complianceVerifier,
    LENDING_ADDRESS: deployment.lending,
    ROLE_ADMIN_MANAGER_ADDRESS: deployment.roleAdminManager || ""
  };
  if (deployment.adminAddress) shared.ADMIN_ADDRESS = deployment.adminAddress;
  if (deployment.oracleAddress) shared.ORACLE_ADDRESS = deployment.oracleAddress;
  if (deployment.loanOfficerAddress) shared.LOAN_OFFICER_ADDRESS = deployment.loanOfficerAddress;

  writeEnv(rootEnvPath, {
    ...shared,
    ORACLE_PORT: "8787",
    ORACLE_PRIVATE_KEY: HARDHAT_ACCOUNT_1_PRIVATE_KEY,
    DEPLOYER_PRIVATE_KEY: HARDHAT_ACCOUNT_0_PRIVATE_KEY
  });

  writeEnv(frontendEnvPath, {
    VITE_ORACLE_API_URL: "http://localhost:8787",
    VITE_LOCAL_RPC_URL: "http://127.0.0.1:8545",
    VITE_SEPOLIA_RPC_URL: frontendEnv.VITE_SEPOLIA_RPC_URL || "",
    VITE_ADMIN_ADDRESS: deployment.adminAddress || "",
    VITE_ORACLE_ADDRESS: deployment.oracleAddress || "",
    VITE_LOAN_OFFICER_ADDRESS: deployment.loanOfficerAddress || "",
    VITE_PROPERTY_VERIFICATION_ADDRESS: deployment.propertyVerification,
    VITE_LTV_GROTH16_VERIFIER_ADDRESS: deployment.ltvGroth16Verifier || "",
    VITE_COMPLIANCE_VERIFIER_ADDRESS: deployment.complianceVerifier,
    VITE_LENDING_ADDRESS: deployment.lending,
    VITE_ROLE_ADMIN_MANAGER_ADDRESS: deployment.roleAdminManager || "",
    VITE_DEFAULT_NETWORK: "localhost"
  });

  console.log("Synced localhost deployment into .env.local and frontend/.env.local");
  console.log(JSON.stringify(deployment, null, 2));
}

main();
