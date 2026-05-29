require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

const PROPERTY_VERIFICATION_ABI = [
  "function setVerified(bytes32 propertyId, bool verified, bytes32 evidenceHash, uint256 valuationCommitment)",
  "function getRecord(bytes32 propertyId) view returns (tuple(bool verified,bool compliant,bytes32 evidenceHash,bytes32 complianceHash,uint256 valuationCommitment,uint256 principalCommitment,uint64 lastUpdated))",
  "function isVerified(bytes32 propertyId) view returns (bool)",
  "function isCompliant(bytes32 propertyId) view returns (bool)",
  "function isCompliantFor(bytes32 propertyId,uint256 principalCommitment) view returns (bool)",
  "function valuationCommitmentOf(bytes32 propertyId) view returns (uint256)"
];

const COMPLIANCE_VERIFIER_ABI = [
  "function verifyProofAndSetCompliance(bytes32 propertyId,uint256 principalCommitment,uint256[2] a,uint256[2][2] b,uint256[2] c,uint256[4] publicSignals) returns (bool)",
  "function propertyIdToField(bytes32 propertyId) pure returns (uint256)"
];

const LENDING_ABI = [
  "function requestLoan(bytes32 propertyId,uint256 principalCommitment) returns (uint256)",
  "function approveLoan(uint256 loanId) returns (bool)",
  "function rejectLoan(uint256 loanId)",
  "function cancelLoan(uint256 loanId)",
  "function repay(uint256 loanId)",
  "function getLoan(uint256 loanId) view returns (tuple(address borrower,bytes32 propertyId,uint256 principalCommitment,uint256 interestRateBps,uint256 termDays,uint8 state,uint256 requestedAt,uint256 approvedAt,uint256 repaidAt))",
  "function activeLoanIdOf(bytes32 propertyId) view returns (uint256 loanId,bool exists)",
  "function loanIdsOfProperty(bytes32 propertyId) view returns (uint256[])",
  "function nextLoanId() view returns (uint256)"
];

function loadDeployment(network = process.env.HARDHAT_NETWORK || "localhost") {
  const deploymentPath = path.join(__dirname, "..", "..", "deployments", `${network}.json`);
  if (!fs.existsSync(deploymentPath)) return {};
  return JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
}

function resolveAddress(envName, deployment, deploymentKey) {
  return process.env[envName] || deployment[deploymentKey] || "";
}

function resolveRpcUrl(network) {
  if (network === "sepolia") return process.env.SEPOLIA_RPC_URL;
  return process.env.LOCAL_RPC_URL || "http://127.0.0.1:8545";
}

function connectContracts({ network = "localhost", write = false } = {}) {
  const deployment = loadDeployment(network);
  const rpcUrl = resolveRpcUrl(network);
  if (!rpcUrl) {
    throw new Error(`Missing RPC URL for network ${network}`);
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const privateKey = process.env.ORACLE_PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY || "";
  if (write && !privateKey) {
    throw new Error("Set ORACLE_PRIVATE_KEY or DEPLOYER_PRIVATE_KEY before using --write");
  }
  const runner = write ? new ethers.Wallet(privateKey, provider) : provider;

  const propertyVerificationAddress = resolveAddress(
    "PROPERTY_VERIFICATION_ADDRESS",
    deployment,
    "propertyVerification"
  );
  const complianceVerifierAddress = resolveAddress(
    "COMPLIANCE_VERIFIER_ADDRESS",
    deployment,
    "complianceVerifier"
  );
  const lendingAddress = resolveAddress("LENDING_ADDRESS", deployment, "lending");

  if (!propertyVerificationAddress) {
    throw new Error("Missing PROPERTY_VERIFICATION_ADDRESS or deployment file");
  }

  return {
    provider,
    runner,
    propertyVerification: new ethers.Contract(
      propertyVerificationAddress,
      PROPERTY_VERIFICATION_ABI,
      runner
    ),
    complianceVerifier: complianceVerifierAddress
      ? new ethers.Contract(complianceVerifierAddress, COMPLIANCE_VERIFIER_ABI, runner)
      : null,
    lending: lendingAddress ? new ethers.Contract(lendingAddress, LENDING_ABI, runner) : null
  };
}

module.exports = {
  PROPERTY_VERIFICATION_ABI,
  COMPLIANCE_VERIFIER_ABI,
  LENDING_ABI,
  loadDeployment,
  connectContracts
};
