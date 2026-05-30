const {
  loadProperties,
  buildVerification,
  buildCompliance
} = require("./properties");
const { connectContracts } = require("./contracts");
const { generateComplianceProof } = require("../../zk/prover");

async function listProperties() {
  return loadProperties();
}

async function verifyProperty(propertyId, { write = false, network = "localhost" } = {}) {
  const result = await buildVerification(propertyId);

  if (!write) return result;

  const { propertyVerification } = connectContracts({ network, write: true });
  const tx = await propertyVerification.setVerified(
    result.propertyKey,
    result.verified,
    result.evidenceHash,
    BigInt(result.valuationCommitment),
    result.ownerAddress
  );
  const receipt = await tx.wait();

  return {
    ...result,
    txHash: receipt.hash
  };
}

async function checkCompliance(
  propertyId,
  loanPrincipal,
  { write = false, network = "localhost", principalSalt } = {}
) {
  const result = await buildCompliance(propertyId, loanPrincipal, principalSalt);
  if (!result.exists || !result.compliant) return result;

  const generatedProof = await generateComplianceProof(result.proofInputs);
  const proofResult = {
    ...result,
    proof: generatedProof.proof,
    publicSignals: generatedProof.publicSignals,
    solidity: generatedProof.solidity
  };

  if (!write) return proofResult;

  const { complianceVerifier } = connectContracts({ network, write: true });
  if (!complianceVerifier) {
    throw new Error("Missing COMPLIANCE_VERIFIER_ADDRESS or deployment file");
  }

  const tx = await complianceVerifier.verifyProofAndSetCompliance(
    proofResult.propertyKey,
    BigInt(proofResult.principalCommitment),
    proofResult.solidity.a,
    proofResult.solidity.b,
    proofResult.solidity.c,
    proofResult.solidity.publicSignals
  );
  const receipt = await tx.wait();

  return {
    ...proofResult,
    txHash: receipt.hash
  };
}

async function runVerificationAndCompliance(
  propertyId,
  loanPrincipal,
  { write = false, network = "localhost", principalSalt } = {}
) {
  const verification = await verifyProperty(propertyId, { write, network });
  const compliance = await checkCompliance(propertyId, loanPrincipal, {
    write,
    network,
    principalSalt
  });

  return {
    verification,
    compliance
  };
}

module.exports = {
  listProperties,
  verifyProperty,
  checkCompliance,
  runVerificationAndCompliance
};
