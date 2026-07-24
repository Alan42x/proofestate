const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");
const { createJsonRpcProvider } = require("../backend/oracle/contracts");

require("./load-env");

const rootDir = path.join(__dirname, "..");
const deploymentPath = path.join(rootDir, "deployments", "sepolia.json");
const propertyId = process.argv[2] || "PROP-001";

const PROPERTY_VERIFICATION_ABI = [
  "function hasRole(bytes32 role, address account) view returns (bool)",
  "function ownerOf(bytes32 propertyId) view returns (address)",
  "function isVerified(bytes32 propertyId) view returns (bool)",
  "function isCompliant(bytes32 propertyId) view returns (bool)",
  "function getRecord(bytes32 propertyId) view returns (tuple(bool verified,bool compliant,address owner,bytes32 evidenceHash,bytes32 complianceHash,uint256 valuationCommitment,uint256 principalCommitment,uint64 lastUpdated))"
];

const LENDING_ABI = [
  "function hasRole(bytes32 role, address account) view returns (bool)",
  "function nextLoanId() view returns (uint256)",
  "function getLoan(uint256 loanId) view returns (tuple(address borrower,bytes32 propertyId,uint256 principalCommitment,uint256 interestRateBps,uint256 termDays,uint8 state,uint256 requestedAt,uint256 approvedAt,uint256 repaidAt))"
];

const ROLE_ADMIN_MANAGER_ABI = [
  "function hasProtocolAdmin(address account) view returns (bool managerAdmin,bool propertyAdmin,bool lendingAdmin,bool complete)"
];

function jsonReplacer(_key, value) {
  return typeof value === "bigint" ? value.toString() : value;
}

function etherscanAddress(address) {
  return `https://sepolia.etherscan.io/address/${address}`;
}

function etherscanTx(hash) {
  return `https://sepolia.etherscan.io/tx/${hash}`;
}

async function main() {
  if (!fs.existsSync(deploymentPath)) {
    throw new Error("Missing deployments/sepolia.json. Run pnpm deploy:sepolia first.");
  }
  if (!process.env.SEPOLIA_RPC_URL) {
    throw new Error("Missing SEPOLIA_RPC_URL in .env.sepolia.");
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  const provider = createJsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  const propertyKey = ethers.id(propertyId);
  const propertyVerification = new ethers.Contract(
    deployment.propertyVerification,
    PROPERTY_VERIFICATION_ABI,
    provider
  );
  const lending = new ethers.Contract(deployment.lending, LENDING_ABI, provider);
  const roleAdminManager = deployment.roleAdminManager
    ? new ethers.Contract(deployment.roleAdminManager, ROLE_ADMIN_MANAGER_ABI, provider)
    : null;

  const contractAddresses = {
    propertyVerification: deployment.propertyVerification,
    ltvGroth16Verifier: deployment.ltvGroth16Verifier,
    complianceVerifier: deployment.complianceVerifier,
    lending: deployment.lending,
    roleAdminManager: deployment.roleAdminManager
  };
  const bytecodeChecks = {};
  for (const [name, address] of Object.entries(contractAddresses)) {
    const code = await provider.getCode(address);
    bytecodeChecks[name] = {
      address,
      deployed: code !== "0x",
      etherscan: etherscanAddress(address)
    };
  }

  const defaultAdminRole = ethers.ZeroHash;
  const oracleRole = ethers.id("ORACLE_ROLE");
  const complianceRole = ethers.id("COMPLIANCE_ROLE");
  const loanOfficerRole = ethers.id("LOAN_OFFICER_ROLE");
  const roleAdminManagerStatus = roleAdminManager
    ? await roleAdminManager.hasProtocolAdmin(deployment.adminAddress)
    : null;
  const oldRoleAdminManager = deployment.previousRoleAdminManager;
  const [adminHasVerificationAdmin, oracleHasRole, complianceVerifierHasRole, adminHasLendingAdmin, loanOfficerHasRole, managerHasVerificationAdmin, managerHasLendingAdmin, oldManagerHasVerificationAdmin, oldManagerHasLendingAdmin] =
    await Promise.all([
      propertyVerification.hasRole(defaultAdminRole, deployment.adminAddress),
      propertyVerification.hasRole(oracleRole, deployment.oracleAddress),
      propertyVerification.hasRole(complianceRole, deployment.complianceVerifier),
      lending.hasRole(defaultAdminRole, deployment.adminAddress),
      lending.hasRole(loanOfficerRole, deployment.loanOfficerAddress),
      deployment.roleAdminManager
        ? propertyVerification.hasRole(defaultAdminRole, deployment.roleAdminManager)
        : Promise.resolve(false),
      deployment.roleAdminManager
        ? lending.hasRole(defaultAdminRole, deployment.roleAdminManager)
        : Promise.resolve(false),
      oldRoleAdminManager
        ? propertyVerification.hasRole(defaultAdminRole, oldRoleAdminManager)
        : Promise.resolve(false),
      oldRoleAdminManager
        ? lending.hasRole(defaultAdminRole, oldRoleAdminManager)
        : Promise.resolve(false)
    ]);

  const [owner, verified, compliant, record, nextLoanId, deployerBalance] = await Promise.all([
    propertyVerification.ownerOf(propertyKey),
    propertyVerification.isVerified(propertyKey),
    propertyVerification.isCompliant(propertyKey),
    propertyVerification.getRecord(propertyKey),
    lending.nextLoanId(),
    provider.getBalance(deployment.deployer)
  ]);

  const latestLoans = [];
  const start = nextLoanId > 5n ? nextLoanId - 5n : 0n;
  for (let loanId = start; loanId < nextLoanId; loanId++) {
    const loan = await lending.getLoan(loanId);
    latestLoans.push({
      id: loanId,
      borrower: loan.borrower,
      propertyId: loan.propertyId,
      principalCommitment: loan.principalCommitment,
      state: loan.state,
      requestedAt: loan.requestedAt,
      approvedAt: loan.approvedAt,
      repaidAt: loan.repaidAt
    });
  }

  const result = {
    network: "sepolia",
    propertyId,
    propertyKey,
    deployedAt: deployment.deployedAt,
    deployer: {
      address: deployment.deployer,
      balanceEth: ethers.formatEther(deployerBalance),
      etherscan: etherscanAddress(deployment.deployer)
    },
    roles: {
      adminAddress: deployment.adminAddress,
      oracleAddress: deployment.oracleAddress,
      loanOfficerAddress: deployment.loanOfficerAddress,
      adminHasVerificationAdmin,
      oracleHasRole,
      complianceVerifierHasRole,
      adminHasLendingAdmin,
      loanOfficerHasRole,
      roleAdminManager: deployment.roleAdminManager,
      roleAdminManagerComplete: Boolean(roleAdminManagerStatus?.complete ?? roleAdminManagerStatus?.[3]),
      managerHasVerificationAdmin,
      managerHasLendingAdmin,
      previousRoleAdminManager: oldRoleAdminManager || "",
      previousManagerHasVerificationAdmin: oldManagerHasVerificationAdmin,
      previousManagerHasLendingAdmin: oldManagerHasLendingAdmin
    },
    contracts: bytecodeChecks,
    propertyRecord: {
      owner,
      verified,
      compliant,
      evidenceHash: record.evidenceHash,
      complianceHash: record.complianceHash,
      valuationCommitment: record.valuationCommitment,
      principalCommitment: record.principalCommitment,
      lastUpdated: record.lastUpdated
    },
    lending: {
      nextLoanId,
      latestLoans
    },
    explorers: {
      propertyVerification: etherscanAddress(deployment.propertyVerification),
      complianceVerifier: etherscanAddress(deployment.complianceVerifier),
      lending: etherscanAddress(deployment.lending),
      lastPropertyEvidenceTxHint: "Open the PropertyVerification Events tab on Etherscan.",
      txUrlFormat: etherscanTx("TRANSACTION_HASH")
    }
  };

  console.log(JSON.stringify(result, jsonReplacer, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
