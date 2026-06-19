require("./load-env");

const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");
const { runVerificationAndCompliance } = require("../backend/oracle/service");
const { LENDING_ABI } = require("../backend/oracle/contracts");

const DEFAULT_BORROWER_PRIVATE_KEY =
  "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6";
const DEFAULT_LOAN_OFFICER_PRIVATE_KEY =
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a";

function propertyKey(propertyId) {
  return ethers.id(propertyId);
}

async function main() {
  const propertyId = process.argv[2] || "PROP-001";
  const principal = BigInt(process.argv[3] || "750000");
  const deploymentPath = path.join(__dirname, "..", "deployments", "localhost.json");

  if (!fs.existsSync(deploymentPath)) {
    throw new Error("Missing deployments/localhost.json. Run pnpm demo:deploy first.");
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  console.log(`Running oracle verification + compliance for ${propertyId}`);
  const oracleResult = await runVerificationAndCompliance(propertyId, principal.toString(), {
    write: true,
    network: "localhost"
  });
  console.log(`Verification tx: ${oracleResult.verification.txHash}`);
  console.log(`Compliance tx: ${oracleResult.compliance.txHash}`);

  const rpcUrl = process.env.LOCAL_RPC_URL || "http://127.0.0.1:8545";
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const borrowerWallet = new ethers.Wallet(
    process.env.BORROWER_PRIVATE_KEY || DEFAULT_BORROWER_PRIVATE_KEY,
    provider
  );
  const loanOfficerWallet = new ethers.Wallet(
    process.env.LOAN_OFFICER_PRIVATE_KEY || DEFAULT_LOAN_OFFICER_PRIVATE_KEY,
    provider
  );
  const borrowerLending = new ethers.Contract(deployment.lending, LENDING_ABI, borrowerWallet);
  const loanOfficerLending = new ethers.Contract(deployment.lending, LENDING_ABI, loanOfficerWallet);
  const borrowerNonce = await provider.getTransactionCount(borrowerWallet.address, "pending");
  const officerNonce = await provider.getTransactionCount(loanOfficerWallet.address, "pending");
  let nextBorrowerNonce = borrowerNonce;
  let nextOfficerNonce = officerNonce;
  const borrowerOptions = () => ({ nonce: nextBorrowerNonce++ });
  const officerOptions = () => ({ nonce: nextOfficerNonce++ });
  const loanId = await borrowerLending.nextLoanId();
  const key = propertyKey(propertyId);

  const principalCommitment = BigInt(oracleResult.compliance.principalCommitment);

  console.log(`Requesting loan ${loanId.toString()} with principal commitment ${principalCommitment.toString()}`);
  await (await borrowerLending.requestLoan(key, principalCommitment, borrowerOptions())).wait();

  console.log(`Approving loan ${loanId.toString()}`);
  await (await loanOfficerLending.approveLoan(loanId, officerOptions())).wait();

  console.log(`Repaying loan ${loanId.toString()}`);
  await (await borrowerLending.repay(loanId, borrowerOptions())).wait();

  const loan = await borrowerLending.getLoan(loanId);
  console.log(
    JSON.stringify(
      {
        loanId: loanId.toString(),
        borrower: loan.borrower,
        principalCommitment: loan.principalCommitment.toString(),
        state: Number(loan.state),
        stateLabel: ["Requested", "Approved", "Repaid", "Rejected", "Cancelled"][Number(loan.state)]
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
