const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

const LOCAL_DEMO_ACCOUNTS = {
  admin: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  oracle: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  loanOfficer: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"
};

function normalizeAddress(value) {
  return hre.ethers.getAddress(value);
}

function sameAddress(left, right) {
  return normalizeAddress(left) === normalizeAddress(right);
}

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const deployerAddress = normalizeAddress(deployer.address);
  const network = hre.network.name;

  console.log(`Deploying to ${network} with ${deployerAddress}`);

  const PropertyVerification = await hre.ethers.getContractFactory("PropertyVerification");
  const propertyVerification = await PropertyVerification.deploy(deployerAddress);
  await propertyVerification.waitForDeployment();

  const LtvGroth16Verifier = await hre.ethers.getContractFactory("LtvGroth16Verifier");
  const ltvGroth16Verifier = await LtvGroth16Verifier.deploy();
  await ltvGroth16Verifier.waitForDeployment();

  const ComplianceVerifier = await hre.ethers.getContractFactory("ComplianceVerifier");
  const complianceVerifier = await ComplianceVerifier.deploy(
    propertyVerification.target,
    ltvGroth16Verifier.target
  );
  await complianceVerifier.waitForDeployment();

  const Lending = await hre.ethers.getContractFactory("Lending");
  const lending = await Lending.deploy(propertyVerification.target, deployerAddress);
  await lending.waitForDeployment();

  const RoleAdminManager = await hre.ethers.getContractFactory("RoleAdminManager");
  const roleAdminManager = await RoleAdminManager.deploy(
    propertyVerification.target,
    lending.target,
    deployerAddress
  );
  await roleAdminManager.waitForDeployment();

  const localDefaults = network === "localhost" || network === "hardhat";
  const adminAddress = normalizeAddress(
    localDefaults ? LOCAL_DEMO_ACCOUNTS.admin : process.env.ADMIN_ADDRESS || deployerAddress
  );
  const oracleAddress = normalizeAddress(
    localDefaults ? LOCAL_DEMO_ACCOUNTS.oracle : process.env.ORACLE_ADDRESS || deployerAddress
  );
  const loanOfficerAddress = normalizeAddress(
    localDefaults ? LOCAL_DEMO_ACCOUNTS.loanOfficer : process.env.LOAN_OFFICER_ADDRESS || deployerAddress
  );

  const defaultAdminRole = await propertyVerification.DEFAULT_ADMIN_ROLE();
  const oracleRole = await propertyVerification.ORACLE_ROLE();
  const complianceRole = await propertyVerification.COMPLIANCE_ROLE();
  const loanOfficerRole = await lending.LOAN_OFFICER_ROLE();

  await (await propertyVerification.grantRole(defaultAdminRole, roleAdminManager.target)).wait();
  await (await lending.grantRole(defaultAdminRole, roleAdminManager.target)).wait();
  if (!sameAddress(adminAddress, deployerAddress)) {
    await (await roleAdminManager.grantProtocolAdmin(adminAddress)).wait();
  }
  if (!sameAddress(oracleAddress, deployerAddress)) {
    await (await propertyVerification.grantRole(oracleRole, oracleAddress)).wait();
  }
  await (await propertyVerification.grantRole(complianceRole, complianceVerifier.target)).wait();
  if (!sameAddress(loanOfficerAddress, deployerAddress)) {
    await (await lending.grantRole(loanOfficerRole, loanOfficerAddress)).wait();
  }
  if (!sameAddress(oracleAddress, adminAddress)) {
    await (await propertyVerification.revokeRole(oracleRole, adminAddress)).wait();
  }
  if (!sameAddress(loanOfficerAddress, adminAddress)) {
    await (await lending.revokeRole(loanOfficerRole, adminAddress)).wait();
  }
  if (!sameAddress(adminAddress, deployerAddress)) {
    await (await propertyVerification.revokeRole(defaultAdminRole, deployerAddress)).wait();
    await (await lending.revokeRole(defaultAdminRole, deployerAddress)).wait();
    await (await roleAdminManager.revokeRole(defaultAdminRole, deployerAddress)).wait();
  }

  const deployment = {
    network,
    deployer: deployerAddress,
    adminAddress,
    propertyVerification: propertyVerification.target,
    ltvGroth16Verifier: ltvGroth16Verifier.target,
    complianceVerifier: complianceVerifier.target,
    lending: lending.target,
    roleAdminManager: roleAdminManager.target,
    oracleAddress,
    loanOfficerAddress,
    deployedAt: new Date().toISOString()
  };

  const outputDir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(
    path.join(outputDir, `${network}.json`),
    `${JSON.stringify(deployment, null, 2)}\n`
  );

  console.log(JSON.stringify(deployment, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
