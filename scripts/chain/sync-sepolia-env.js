const fs = require("fs");
const path = require("path");

require("../load-env");

const rootDir = path.join(__dirname, "../..");
const deploymentPath = path.join(rootDir, "deployments", "sepolia.json");
const rootEnvPath = path.join(
  rootDir,
  process.env.PROOFESTATE_ENV_FILE || process.env.DOTENV_CONFIG_PATH || ".env.sepolia"
);
const frontendEnvPath = path.join(rootDir, "frontend", ".env.sepolia");

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
  const order = [
    "SEPOLIA_RPC_URL",
    "DEPLOYER_PRIVATE_KEY",
    "ORACLE_PRIVATE_KEY",
    "ADMIN_ADDRESS",
    "ORACLE_ADDRESS",
    "LOAN_OFFICER_ADDRESS",
    "PROPERTY_VERIFICATION_ADDRESS",
    "LTV_GROTH16_VERIFIER_ADDRESS",
    "COMPLIANCE_VERIFIER_ADDRESS",
    "LENDING_ADDRESS",
    "ROLE_ADMIN_MANAGER_ADDRESS",
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
  const orderedKeys = Object.keys(merged).sort((a, b) => {
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
    throw new Error("Missing deployments/sepolia.json. Run pnpm deploy:sepolia first.");
  }

  const rootEnv = readEnv(rootEnvPath);
  const frontendEnv = readEnv(frontendEnvPath);
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  const shared = {
    ADMIN_ADDRESS: deployment.adminAddress || deployment.deployer,
    ORACLE_ADDRESS: deployment.oracleAddress || deployment.deployer,
    LOAN_OFFICER_ADDRESS: deployment.loanOfficerAddress || deployment.deployer,
    PROPERTY_VERIFICATION_ADDRESS: deployment.propertyVerification,
    LTV_GROTH16_VERIFIER_ADDRESS: deployment.ltvGroth16Verifier || "",
    COMPLIANCE_VERIFIER_ADDRESS: deployment.complianceVerifier,
    LENDING_ADDRESS: deployment.lending,
    ROLE_ADMIN_MANAGER_ADDRESS: deployment.roleAdminManager || ""
  };

  writeEnv(rootEnvPath, shared);

  writeEnv(frontendEnvPath, {
    VITE_ORACLE_API_URL: frontendEnv.VITE_ORACLE_API_URL || "http://localhost:8787",
    VITE_LOCAL_RPC_URL: frontendEnv.VITE_LOCAL_RPC_URL || "http://127.0.0.1:8545",
    VITE_SEPOLIA_RPC_URL:
      frontendEnv.VITE_SEPOLIA_RPC_URL || rootEnv.SEPOLIA_RPC_URL || process.env.SEPOLIA_RPC_URL || "",
    VITE_ADMIN_ADDRESS: shared.ADMIN_ADDRESS,
    VITE_ORACLE_ADDRESS: shared.ORACLE_ADDRESS,
    VITE_LOAN_OFFICER_ADDRESS: shared.LOAN_OFFICER_ADDRESS,
    VITE_PROPERTY_VERIFICATION_ADDRESS: shared.PROPERTY_VERIFICATION_ADDRESS,
    VITE_LTV_GROTH16_VERIFIER_ADDRESS: shared.LTV_GROTH16_VERIFIER_ADDRESS,
    VITE_COMPLIANCE_VERIFIER_ADDRESS: shared.COMPLIANCE_VERIFIER_ADDRESS,
    VITE_LENDING_ADDRESS: shared.LENDING_ADDRESS,
    VITE_ROLE_ADMIN_MANAGER_ADDRESS: shared.ROLE_ADMIN_MANAGER_ADDRESS,
    VITE_DEFAULT_NETWORK: "sepolia"
  });

  console.log("Synced Sepolia deployment into .env.sepolia and frontend/.env.sepolia");
  console.log(JSON.stringify(deployment, null, 2));
}

main();
