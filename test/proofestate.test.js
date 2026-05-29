const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const {
  buildVerification,
  buildCompliance,
  evaluateProperty,
  parsePositiveCircuitInteger
} = require("../backend/oracle/properties");
const { deterministicSalt } = require("../zk/ltvCircuit");
const { generateComplianceProof } = require("../zk/prover");

const PROPERTY = Object.freeze({
  verified: "PROP-001",
  duplicateLoanGuard: "PROP-003",
  encumbered: "PROP-004",
  missing: "PROP-404"
});

const PRINCIPAL = Object.freeze({
  compliant: 750_000n,
  prop003FirstLoan: 500_000n,
  prop003SecondLoan: 400_000n,
  aboveLtv: 900_000n
});

const LOAN_STATE = Object.freeze({
  requested: 0,
  approved: 1,
  repaid: 2,
  rejected: 3,
  cancelled: 4
});

const proofCache = new Map();

async function complianceProofFor(propertyId, principal) {
  const cacheKey = `${propertyId}:${principal.toString()}`;
  if (proofCache.has(cacheKey)) return proofCache.get(cacheKey);

  const principalSalt = deterministicSalt("test principal salt", propertyId, principal.toString());
  const compliance = await buildCompliance(propertyId, principal, principalSalt);
  const generated = compliance.compliant
    ? await generateComplianceProof(compliance.proofInputs)
    : null;
  const result = { compliance, generated };
  proofCache.set(cacheKey, result);
  return result;
}

async function deployProtocolFixture() {
  const [deployer, oracle, borrower, loanOfficer, other] = await ethers.getSigners();

  const PropertyVerification = await ethers.getContractFactory("PropertyVerification");
  const verification = await PropertyVerification.deploy(deployer.address);

  const LtvGroth16Verifier = await ethers.getContractFactory("LtvGroth16Verifier");
  const ltvVerifier = await LtvGroth16Verifier.deploy();

  const ComplianceVerifier = await ethers.getContractFactory("ComplianceVerifier");
  const compliance = await ComplianceVerifier.deploy(verification.target, ltvVerifier.target);

  const Lending = await ethers.getContractFactory("Lending");
  const lending = await Lending.deploy(verification.target, deployer.address);

  await verification.grantRole(await verification.ORACLE_ROLE(), oracle.address);
  await verification.grantRole(await verification.COMPLIANCE_ROLE(), compliance.target);
  await lending.grantRole(await lending.LOAN_OFFICER_ROLE(), loanOfficer.address);

  return {
    deployer,
    oracle,
    borrower,
    loanOfficer,
    other,
    verification,
    ltvVerifier,
    compliance,
    lending
  };
}

async function setVerification(fixture, propertyId = PROPERTY.verified) {
  const result = await buildVerification(propertyId);
  await fixture.verification
    .connect(fixture.oracle)
    .setVerified(
      result.propertyKey,
      result.verified,
      result.evidenceHash,
      BigInt(result.valuationCommitment)
    );
  return result;
}

async function setVerifiedAndCompliant(
  fixture,
  propertyId = PROPERTY.verified,
  principal = PRINCIPAL.compliant
) {
  const verificationResult = await setVerification(fixture, propertyId);
  const { compliance: complianceResult, generated } = await complianceProofFor(propertyId, principal);
  expect(complianceResult.compliant).to.equal(true);
  expect(generated).to.not.equal(null);

  await fixture.compliance.verifyProofAndSetCompliance(
    verificationResult.propertyKey,
    BigInt(complianceResult.principalCommitment),
    generated.solidity.a,
    generated.solidity.b,
    generated.solidity.c,
    generated.solidity.publicSignals
  );

  return {
    propertyId: verificationResult.propertyKey,
    principalCommitment: BigInt(complianceResult.principalCommitment)
  };
}

async function requestLoan(fixture, propertyId, principalCommitment, borrower = fixture.borrower) {
  return fixture.lending.connect(borrower).requestLoan(propertyId, principalCommitment);
}

async function approveLoan(fixture, loanId = 0) {
  return fixture.lending.connect(fixture.loanOfficer).approveLoan(loanId);
}

async function requestAndApproveLoan(
  fixture,
  propertyId = PROPERTY.verified,
  principal = PRINCIPAL.compliant
) {
  const compliantLoan = await setVerifiedAndCompliant(fixture, propertyId, principal);
  await requestLoan(fixture, compliantLoan.propertyId, compliantLoan.principalCommitment);
  await approveLoan(fixture);
  return compliantLoan;
}

async function expectNoActiveLoan(lending, propertyId) {
  const activeLoan = await lending.activeLoanIdOf(propertyId);
  expect(activeLoan.exists).to.equal(false);
}

async function expectActiveLoan(lending, propertyId, expectedLoanId) {
  const activeLoan = await lending.activeLoanIdOf(propertyId);
  expect(activeLoan.loanId).to.equal(BigInt(expectedLoanId));
  expect(activeLoan.exists).to.equal(true);
}

function expectLoanState(loan, expectedState) {
  expect(Number(loan.state)).to.equal(expectedState);
}

async function expectAsyncError(promise, message) {
  let error;
  try {
    await promise;
  } catch (caught) {
    error = caught;
  }
  expect(error).to.be.instanceOf(Error);
  expect(error.message).to.include(message);
}

describe("ProofEstate contracts", function () {
  this.timeout(120000);

  describe("Oracle registry and input rules", function () {
    it("evaluates mock registry verification rules deterministically", async function () {
      const activeProperty = (await buildVerification(PROPERTY.verified)).property;
      const encumberedProperty = (await buildVerification(PROPERTY.encumbered)).property;
      const missingProperty = (await buildVerification(PROPERTY.missing)).property;

      expect(evaluateProperty(activeProperty).passes).to.equal(true);
      expect(evaluateProperty(encumberedProperty).passes).to.equal(false);
      expect(evaluateProperty(encumberedProperty).reasons).to.include("NO_ENCUMBRANCE");
      expect(evaluateProperty(missingProperty).reasons).to.deep.equal(["PROPERTY_NOT_FOUND"]);
    });

    it("rejects invalid loan principal inputs before proof generation", async function () {
      expect(parsePositiveCircuitInteger("1", "loanPrincipal")).to.equal(1n);
      await expectAsyncError(buildCompliance(PROPERTY.verified, 0n), "greater than 0");
      await expectAsyncError(buildCompliance(PROPERTY.verified, -1n), "greater than 0");
      await expectAsyncError(buildCompliance(PROPERTY.verified, "not-a-number"), "must be an integer");
      await expectAsyncError(buildCompliance(PROPERTY.verified, 1n << 64n), "64-bit circuit range");
    });
  });

  describe("Deployment and role configuration", function () {
    it("deploys with least-privilege oracle and compliance roles", async function () {
      const { deployer, oracle, verification, compliance, lending, loanOfficer } =
        await loadFixture(deployProtocolFixture);

      const defaultAdminRole = await verification.DEFAULT_ADMIN_ROLE();
      const oracleRole = await verification.ORACLE_ROLE();
      const complianceRole = await verification.COMPLIANCE_ROLE();
      const loanOfficerRole = await lending.LOAN_OFFICER_ROLE();

      expect(await verification.hasRole(defaultAdminRole, deployer.address)).to.equal(true);
      expect(await lending.hasRole(defaultAdminRole, deployer.address)).to.equal(true);
      expect(await verification.hasRole(oracleRole, deployer.address)).to.equal(true);
      expect(await verification.hasRole(oracleRole, oracle.address)).to.equal(true);
      expect(await verification.hasRole(complianceRole, compliance.target)).to.equal(true);
      expect(await verification.hasRole(complianceRole, deployer.address)).to.equal(false);
      expect(await lending.hasRole(loanOfficerRole, loanOfficer.address)).to.equal(true);
    });

    it("rejects zero verification and verifier addresses", async function () {
      const { deployer, verification, ltvVerifier } = await loadFixture(deployProtocolFixture);
      const ComplianceVerifier = await ethers.getContractFactory("ComplianceVerifier");
      const Lending = await ethers.getContractFactory("Lending");

      await expect(
        ComplianceVerifier.deploy(ethers.ZeroAddress, ltvVerifier.target)
      ).to.be.revertedWithCustomError(ComplianceVerifier, "InvalidPropertyVerificationAddress");

      await expect(
        ComplianceVerifier.deploy(verification.target, ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(ComplianceVerifier, "InvalidGroth16VerifierAddress");

      await expect(
        Lending.deploy(ethers.ZeroAddress, deployer.address)
      ).to.be.revertedWithCustomError(Lending, "InvalidVerificationAddress");
    });

    it("can deploy contracts with a dedicated admin address", async function () {
      const { deployer, other, verification } = await loadFixture(deployProtocolFixture);
      const PropertyVerification = await ethers.getContractFactory("PropertyVerification");
      const Lending = await ethers.getContractFactory("Lending");

      const adminVerification = await PropertyVerification.deploy(other.address);
      const adminLending = await Lending.deploy(verification.target, other.address);
      const defaultAdminRole = await adminVerification.DEFAULT_ADMIN_ROLE();
      const oracleRole = await adminVerification.ORACLE_ROLE();
      const loanOfficerRole = await adminLending.LOAN_OFFICER_ROLE();

      expect(await adminVerification.hasRole(defaultAdminRole, other.address)).to.equal(true);
      expect(await adminVerification.hasRole(oracleRole, other.address)).to.equal(true);
      expect(await adminVerification.hasRole(defaultAdminRole, deployer.address)).to.equal(false);
      expect(await adminLending.hasRole(defaultAdminRole, other.address)).to.equal(true);
      expect(await adminLending.hasRole(loanOfficerRole, other.address)).to.equal(true);
      expect(await adminLending.hasRole(defaultAdminRole, deployer.address)).to.equal(false);
    });
  });

  describe("PropertyVerification", function () {
    it("stores oracle verification records and exposes read helpers", async function () {
      const fixture = await loadFixture(deployProtocolFixture);
      const verificationResult = await setVerification(fixture, PROPERTY.verified);
      const record = await fixture.verification.getRecord(verificationResult.propertyKey);

      expect(record.verified).to.equal(true);
      expect(record.compliant).to.equal(false);
      expect(record.evidenceHash).to.equal(verificationResult.evidenceHash);
      expect(record.valuationCommitment).to.equal(BigInt(verificationResult.valuationCommitment));
      expect(await fixture.verification.isVerified(verificationResult.propertyKey)).to.equal(true);
      expect(await fixture.verification.isCompliant(verificationResult.propertyKey)).to.equal(false);
    });

    it("rejects empty property ids and unauthorized verification writes", async function () {
      const { borrower, oracle, verification } = await loadFixture(deployProtocolFixture);
      const verificationResult = await buildVerification(PROPERTY.verified);

      await expect(
        verification.connect(oracle).setVerified(
          ethers.ZeroHash,
          true,
          verificationResult.evidenceHash,
          BigInt(verificationResult.valuationCommitment)
        )
      ).to.be.revertedWithCustomError(verification, "EmptyPropertyId");

      await expect(
        verification.connect(borrower).setVerified(
          verificationResult.propertyKey,
          true,
          verificationResult.evidenceHash,
          BigInt(verificationResult.valuationCommitment)
        )
      ).to.be.revertedWithCustomError(verification, "AccessControlUnauthorizedAccount");
    });

    it("prevents direct compliance writes outside the verifier contract", async function () {
      const { deployer, verification } = await loadFixture(deployProtocolFixture);
      const complianceRole = await verification.COMPLIANCE_ROLE();

      await expect(
        verification
          .connect(deployer)
          .setCompliant(ethers.id(PROPERTY.verified), true, ethers.id("proof"), 1n)
      )
        .to.be.revertedWithCustomError(verification, "AccessControlUnauthorizedAccount")
        .withArgs(deployer.address, complianceRole);
    });

    it("clears stale compliance and principal binding when verification is refreshed", async function () {
      const fixture = await loadFixture(deployProtocolFixture);
      const { oracle, verification } = fixture;
      const { propertyId, principalCommitment } = await setVerifiedAndCompliant(fixture);
      const verificationResult = await buildVerification(PROPERTY.verified);

      let record = await verification.getRecord(propertyId);
      expect(record.compliant).to.equal(true);
      expect(record.principalCommitment).to.equal(principalCommitment);

      await verification
        .connect(oracle)
        .setVerified(
          propertyId,
          true,
          ethers.id("new evidence"),
          BigInt(verificationResult.valuationCommitment)
        );

      record = await verification.getRecord(propertyId);
      expect(record.verified).to.equal(true);
      expect(record.compliant).to.equal(false);
      expect(record.complianceHash).to.equal(ethers.ZeroHash);
      expect(record.principalCommitment).to.equal(0n);
    });
  });

  describe("ComplianceVerifier", function () {
    it("sets compliance only after a valid Groth16 proof and binds the principal commitment", async function () {
      const fixture = await loadFixture(deployProtocolFixture);
      const verificationResult = await setVerification(fixture, PROPERTY.verified);
      const { compliance: complianceResult, generated } = await complianceProofFor(
        PROPERTY.verified,
        PRINCIPAL.compliant
      );
      const principalCommitment = BigInt(complianceResult.principalCommitment);

      await expect(
        fixture.compliance.verifyProofAndSetCompliance(
          verificationResult.propertyKey,
          principalCommitment,
          generated.solidity.a,
          generated.solidity.b,
          generated.solidity.c,
          generated.solidity.publicSignals
        )
      )
        .to.emit(fixture.verification, "PropertyComplianceUpdated")
        .withArgs(verificationResult.propertyKey, true, anyValue, principalCommitment, anyValue);

      expect(await fixture.verification.isCompliant(verificationResult.propertyKey)).to.equal(true);
      expect(
        await fixture.verification.isCompliantFor(
          verificationResult.propertyKey,
          principalCommitment
        )
      ).to.equal(true);
      expect(
        await fixture.verification.isCompliantFor(
          verificationResult.propertyKey,
          principalCommitment + 1n
        )
      ).to.equal(false);
    });

    it("rejects proofs for unverified properties", async function () {
      const fixture = await loadFixture(deployProtocolFixture);
      const propertyId = ethers.id(PROPERTY.verified);
      const { compliance: complianceResult, generated } = await complianceProofFor(
        PROPERTY.verified,
        PRINCIPAL.compliant
      );

      await expect(
        fixture.compliance.verifyProofAndSetCompliance(
          propertyId,
          BigInt(complianceResult.principalCommitment),
          generated.solidity.a,
          generated.solidity.b,
          generated.solidity.c,
          generated.solidity.publicSignals
        )
      ).to.be.revertedWithCustomError(fixture.compliance, "PropertyNotVerified");
    });

    it("rejects mismatched principal and valuation public signals", async function () {
      const fixture = await loadFixture(deployProtocolFixture);
      const verificationResult = await setVerification(fixture, PROPERTY.verified);
      const { compliance: complianceResult, generated } = await complianceProofFor(
        PROPERTY.verified,
        PRINCIPAL.compliant
      );

      await expect(
        fixture.compliance.verifyProofAndSetCompliance(
          verificationResult.propertyKey,
          BigInt(complianceResult.principalCommitment) + 1n,
          generated.solidity.a,
          generated.solidity.b,
          generated.solidity.c,
          generated.solidity.publicSignals
        )
      ).to.be.revertedWithCustomError(fixture.compliance, "InvalidPublicSignal");

      const mismatchedSignals = [...generated.solidity.publicSignals];
      mismatchedSignals[1] = (BigInt(mismatchedSignals[1]) + 1n).toString();

      await expect(
        fixture.compliance.verifyProofAndSetCompliance(
          verificationResult.propertyKey,
          BigInt(complianceResult.principalCommitment),
          generated.solidity.a,
          generated.solidity.b,
          generated.solidity.c,
          mismatchedSignals
        )
      ).to.be.revertedWithCustomError(fixture.compliance, "InvalidPublicSignal");

      expect(await fixture.verification.isCompliant(verificationResult.propertyKey)).to.equal(false);
    });

    it("rejects tampered Groth16 proofs and cannot prove above the 80 percent LTV rule", async function () {
      const fixture = await loadFixture(deployProtocolFixture);
      const verificationResult = await setVerification(fixture, PROPERTY.verified);
      const { compliance: complianceResult, generated } = await complianceProofFor(
        PROPERTY.verified,
        PRINCIPAL.compliant
      );
      const tamperedA = [...generated.solidity.a];
      tamperedA[0] = "1";

      await expect(
        fixture.compliance.verifyProofAndSetCompliance(
          verificationResult.propertyKey,
          BigInt(complianceResult.principalCommitment),
          tamperedA,
          generated.solidity.b,
          generated.solidity.c,
          generated.solidity.publicSignals
        )
      ).to.be.revertedWithCustomError(fixture.compliance, "InvalidProof");

      const nonCompliant = await buildCompliance(PROPERTY.verified, PRINCIPAL.aboveLtv, 12345n);
      expect(nonCompliant.compliant).to.equal(false);

      let proofRejected = false;
      const originalConsoleError = console.error;
      try {
        console.error = () => {};
        await generateComplianceProof(nonCompliant.proofInputs);
      } catch (_error) {
        proofRejected = true;
      } finally {
        console.error = originalConsoleError;
      }

      expect(proofRejected).to.equal(true);
    });
  });

  describe("Lending", function () {
    it("rejects invalid loan ids, empty property ids, and zero principal commitments", async function () {
      const { borrower, lending } = await loadFixture(deployProtocolFixture);

      await expect(lending.getLoan(0)).to.be.revertedWithCustomError(lending, "InvalidLoanId");
      await expect(
        lending.connect(borrower).requestLoan(ethers.ZeroHash, 1n)
      ).to.be.revertedWithCustomError(lending, "EmptyPropertyId");
      await expect(
        lending.connect(borrower).requestLoan(ethers.id(PROPERTY.verified), 0n)
      ).to.be.revertedWithCustomError(lending, "InvalidPrincipalCommitment");
    });

    it("allows a verified and proof-compliant loan to be requested, approved, and repaid", async function () {
      const fixture = await loadFixture(deployProtocolFixture);
      const { borrower, loanOfficer, lending } = fixture;
      const { propertyId, principalCommitment } = await setVerifiedAndCompliant(fixture);

      await expect(requestLoan(fixture, propertyId, principalCommitment))
        .to.emit(lending, "LoanRequested")
        .withArgs(0, borrower.address, propertyId, principalCommitment);
      await expectActiveLoan(lending, propertyId, 0);

      await expect(approveLoan(fixture))
        .to.emit(lending, "LoanApproved")
        .withArgs(0, propertyId);
      await expectActiveLoan(lending, propertyId, 0);

      await expect(lending.connect(borrower).repay(0))
        .to.emit(lending, "LoanRepaid")
        .withArgs(0, borrower.address);
      await expectNoActiveLoan(lending, propertyId);

      const loan = await lending.getLoan(0);
      expectLoanState(loan, LOAN_STATE.repaid);
      expect(loan.principalCommitment).to.equal(principalCommitment);
    });

    it("restricts approval to loan officers and prevents double approval", async function () {
      const fixture = await loadFixture(deployProtocolFixture);
      const { borrower, lending } = fixture;
      const { propertyId, principalCommitment } = await setVerifiedAndCompliant(fixture);

      await requestLoan(fixture, propertyId, principalCommitment);

      await expect(
        lending.connect(borrower).approveLoan(0)
      ).to.be.revertedWithCustomError(lending, "AccessControlUnauthorizedAccount");

      await approveLoan(fixture);
      await expect(approveLoan(fixture)).to.be.revertedWithCustomError(lending, "InvalidLoanState");
    });

    it("rejects unverified or non-compliant loans and releases the active collateral lock", async function () {
      const fixture = await loadFixture(deployProtocolFixture);
      const { borrower, lending } = fixture;
      const failedVerification = await setVerification(fixture, PROPERTY.encumbered);

      expect(failedVerification.verified).to.equal(false);
      await lending.connect(borrower).requestLoan(failedVerification.propertyKey, 123n);
      await expect(approveLoan(fixture))
        .to.emit(lending, "LoanRejectedDueToVerification")
        .withArgs(0, failedVerification.propertyKey);
      expectLoanState(await lending.getLoan(0), LOAN_STATE.rejected);
      await expectNoActiveLoan(lending, failedVerification.propertyKey);

      const verificationResult = await setVerification(fixture, PROPERTY.verified);
      const { compliance: failedCompliance } = await complianceProofFor(
        PROPERTY.verified,
        PRINCIPAL.aboveLtv
      );
      await lending
        .connect(borrower)
        .requestLoan(verificationResult.propertyKey, BigInt(failedCompliance.principalCommitment));

      await expect(lending.connect(fixture.loanOfficer).approveLoan(1))
        .to.emit(lending, "LoanRejectedDueToCompliance")
        .withArgs(1, verificationResult.propertyKey);
      expectLoanState(await lending.getLoan(1), LOAN_STATE.rejected);
      await expectNoActiveLoan(lending, verificationResult.propertyKey);
    });

    it("rejects approval when the accepted proof belongs to another principal commitment", async function () {
      const fixture = await loadFixture(deployProtocolFixture);
      const { borrower, lending } = fixture;
      const verificationResult = await setVerification(fixture, PROPERTY.duplicateLoanGuard);
      const { compliance: approvedCompliance, generated } = await complianceProofFor(
        PROPERTY.duplicateLoanGuard,
        PRINCIPAL.prop003FirstLoan
      );
      const { compliance: requestedCompliance } = await complianceProofFor(
        PROPERTY.duplicateLoanGuard,
        PRINCIPAL.prop003SecondLoan
      );

      await fixture.compliance.verifyProofAndSetCompliance(
        verificationResult.propertyKey,
        BigInt(approvedCompliance.principalCommitment),
        generated.solidity.a,
        generated.solidity.b,
        generated.solidity.c,
        generated.solidity.publicSignals
      );

      await lending
        .connect(borrower)
        .requestLoan(verificationResult.propertyKey, BigInt(requestedCompliance.principalCommitment));

      await expect(approveLoan(fixture))
        .to.emit(lending, "LoanRejectedDueToProofMismatch")
        .withArgs(0, verificationResult.propertyKey, BigInt(requestedCompliance.principalCommitment));

      expectLoanState(await lending.getLoan(0), LOAN_STATE.rejected);
      await expectNoActiveLoan(lending, verificationResult.propertyKey);
    });

    it("locks a property while requested and releases it on borrower cancellation", async function () {
      const fixture = await loadFixture(deployProtocolFixture);
      const { borrower, lending } = fixture;
      const { propertyId, principalCommitment } = await setVerifiedAndCompliant(fixture);

      await requestLoan(fixture, propertyId, principalCommitment);
      await expectActiveLoan(lending, propertyId, 0);
      await expect(
        requestLoan(fixture, propertyId, principalCommitment)
      ).to.be.revertedWithCustomError(lending, "ActiveLoanExists").withArgs(propertyId, 0);

      await expect(lending.connect(borrower).cancelLoan(0))
        .to.emit(lending, "LoanCancelled")
        .withArgs(0, propertyId, borrower.address);
      expectLoanState(await lending.getLoan(0), LOAN_STATE.cancelled);
      await expectNoActiveLoan(lending, propertyId);

      await expect(requestLoan(fixture, propertyId, principalCommitment))
        .to.emit(lending, "LoanRequested")
        .withArgs(1, borrower.address, propertyId, principalCommitment);
    });

    it("indexes property loan history across closed and renewed loans", async function () {
      const fixture = await loadFixture(deployProtocolFixture);
      const { borrower, lending } = fixture;
      const { propertyId, principalCommitment } = await setVerifiedAndCompliant(fixture);

      await requestLoan(fixture, propertyId, principalCommitment);
      await approveLoan(fixture, 0);
      await lending.connect(borrower).repay(0);
      await requestLoan(fixture, propertyId, principalCommitment);

      const loanIds = await lending.loanIdsOfProperty(propertyId);
      expect(loanIds.map((loanId) => Number(loanId))).to.deep.equal([0, 1]);
      await expectActiveLoan(lending, propertyId, 1);
    });

    it("allows loan officers to reject requested loans and releases the active collateral lock", async function () {
      const fixture = await loadFixture(deployProtocolFixture);
      const { borrower, lending, loanOfficer, other } = fixture;
      const { propertyId, principalCommitment } = await setVerifiedAndCompliant(fixture);

      await requestLoan(fixture, propertyId, principalCommitment);
      await expect(
        lending.connect(other).rejectLoan(0)
      ).to.be.revertedWithCustomError(lending, "AccessControlUnauthorizedAccount");

      await expect(lending.connect(loanOfficer).rejectLoan(0))
        .to.emit(lending, "LoanRejected")
        .withArgs(0, propertyId);
      expectLoanState(await lending.getLoan(0), LOAN_STATE.rejected);
      await expectNoActiveLoan(lending, propertyId);

      await expect(lending.connect(borrower).requestLoan(propertyId, principalCommitment))
        .to.emit(lending, "LoanRequested")
        .withArgs(1, borrower.address, propertyId, principalCommitment);
    });

    it("keeps approved collateral locked until repayment, preventing PROP-003 over-borrowing", async function () {
      const fixture = await loadFixture(deployProtocolFixture);
      const { borrower, lending } = fixture;
      const { propertyId, principalCommitment } = await requestAndApproveLoan(
        fixture,
        PROPERTY.duplicateLoanGuard,
        PRINCIPAL.prop003FirstLoan
      );
      const secondCompliance = await buildCompliance(
        PROPERTY.duplicateLoanGuard,
        PRINCIPAL.prop003SecondLoan,
        deterministicSalt("second loan", PROPERTY.duplicateLoanGuard)
      );

      await expectActiveLoan(lending, propertyId, 0);
      await expect(
        lending.connect(borrower).requestLoan(propertyId, BigInt(secondCompliance.principalCommitment))
      ).to.be.revertedWithCustomError(lending, "ActiveLoanExists").withArgs(propertyId, 0);

      await lending.connect(borrower).repay(0);
      await expectNoActiveLoan(lending, propertyId);

      await expect(lending.connect(borrower).requestLoan(propertyId, principalCommitment))
        .to.emit(lending, "LoanRequested")
        .withArgs(1, borrower.address, propertyId, principalCommitment);
    });

    it("enforces borrower-only repayment and cancellation state rules", async function () {
      const fixture = await loadFixture(deployProtocolFixture);
      const { borrower, other, lending } = fixture;
      const { propertyId, principalCommitment } = await setVerifiedAndCompliant(fixture);

      await requestLoan(fixture, propertyId, principalCommitment);

      await expect(
        lending.connect(other).cancelLoan(0)
      ).to.be.revertedWithCustomError(lending, "NotBorrower");

      await approveLoan(fixture);
      await expect(
        lending.connect(borrower).cancelLoan(0)
      ).to.be.revertedWithCustomError(lending, "InvalidLoanState");

      await expect(
        lending.connect(other).repay(0)
      ).to.be.revertedWithCustomError(lending, "NotBorrower");

      await lending.connect(borrower).repay(0);
      await expect(
        lending.connect(borrower).repay(0)
      ).to.be.revertedWithCustomError(lending, "InvalidLoanState");
    });
  });
});
