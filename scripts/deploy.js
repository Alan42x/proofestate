const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

const LOCAL_DEMO_ACCOUNTS = {
  admin: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  oracle: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  loanOfficer: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"
};

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const network = hre.network.name;

  console.log(`Deploying to ${network} with ${deployer.address}`);

  const PropertyVerification = await hre.ethers.getContractFactory("PropertyVerification");
  const propertyVerification = await PropertyVerification.deploy(deployer.address);
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
  const lending = await Lending.deploy(propertyVerification.target, deployer.address);
  await lending.waitForDeployment();

  const localDefaults = network === "localhost" || network === "hardhat";
  const adminAddress = localDefaults
    ? LOCAL_DEMO_ACCOUNTS.admin
    : process.env.ADMIN_ADDRESS || deployer.address;
  const oracleAddress = localDefaults
    ? LOCAL_DEMO_ACCOUNTS.oracle
    : process.env.ORACLE_ADDRESS || deployer.address;
  const loanOfficerAddress = localDefaults
    ? LOCAL_DEMO_ACCOUNTS.loanOfficer
    : process.env.LOAN_OFFICER_ADDRESS || deployer.address;

  const defaultAdminRole = await propertyVerification.DEFAULT_ADMIN_ROLE();
  const oracleRole = await propertyVerification.ORACLE_ROLE();
  const complianceRole = await propertyVerification.COMPLIANCE_ROLE();
  const loanOfficerRole = await lending.LOAN_OFFICER_ROLE();

  if (adminAddress !== deployer.address) {
    await (await propertyVerification.grantRole(defaultAdminRole, adminAddress)).wait();
    await (await lending.grantRole(defaultAdminRole, adminAddress)).wait();
  }
  if (oracleAddress !== deployer.address) {
    await (await propertyVerification.grantRole(oracleRole, oracleAddress)).wait();
  }
  await (await propertyVerification.grantRole(complianceRole, complianceVerifier.target)).wait();
  if (loanOfficerAddress !== deployer.address) {
    await (await lending.grantRole(loanOfficerRole, loanOfficerAddress)).wait();
  }
  if (oracleAddress !== adminAddress) {
    await (await propertyVerification.revokeRole(oracleRole, adminAddress)).wait();
  }
  if (loanOfficerAddress !== adminAddress) {
    await (await lending.revokeRole(loanOfficerRole, adminAddress)).wait();
  }
  if (adminAddress !== deployer.address) {
    await (await propertyVerification.revokeRole(defaultAdminRole, deployer.address)).wait();
    await (await lending.revokeRole(defaultAdminRole, deployer.address)).wait();
  }

  const deployment = {
    network,
    deployer: deployer.address,
    adminAddress,
    propertyVerification: propertyVerification.target,
    ltvGroth16Verifier: ltvGroth16Verifier.target,
    complianceVerifier: complianceVerifier.target,
    lending: lending.target,
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
