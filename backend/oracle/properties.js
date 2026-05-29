const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");
const {
  MAX_LTV_BPS,
  VALUE_BITS,
  buildProofInputs,
  computeValuationCommitment,
  fieldFromBytes32,
  randomFieldSalt,
  valuationSaltForProperty
} = require("../../zk/ltvCircuit");

const DATASET_PATH = path.join(__dirname, "..", "..", "data", "properties.json");

const RULES = {
  allowedRegions: new Set(["SG-CCR", "SG-RCR", "SG-OCR"]),
  minimumValuation: 200_000,
  requiredStatus: "ACTIVE",
  requireNoEncumbrance: true
};
const MAX_CIRCUIT_VALUE = (1n << BigInt(VALUE_BITS)) - 1n;

function inputError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function parsePositiveCircuitInteger(value, fieldName) {
  if (value === undefined || value === null || value === "") {
    throw inputError(`${fieldName} is required`);
  }

  let parsed;
  try {
    parsed = BigInt(value);
  } catch (_error) {
    throw inputError(`${fieldName} must be an integer`);
  }

  if (parsed <= 0n) {
    throw inputError(`${fieldName} must be greater than 0`);
  }
  if (parsed > MAX_CIRCUIT_VALUE) {
    throw inputError(`${fieldName} exceeds the ${VALUE_BITS}-bit circuit range`);
  }
  return parsed;
}

function loadProperties() {
  return JSON.parse(fs.readFileSync(DATASET_PATH, "utf8"));
}

function findProperty(propertyId) {
  return loadProperties().find((property) => property.propertyId === propertyId);
}

function propertyKey(propertyId) {
  return ethers.id(propertyId);
}

function evidenceHashFor(property) {
  return ethers.solidityPackedKeccak256(
    ["string", "string", "uint256", "string", "bool", "string", "uint256"],
    [
      property.propertyId,
      property.region,
      property.valuation,
      property.ownerHash,
      property.noEncumbrance,
      property.status,
      property.esgScore
    ]
  );
}

function evaluateProperty(property) {
  if (!property) {
    return {
      passes: false,
      reasons: ["PROPERTY_NOT_FOUND"]
    };
  }

  const checks = [
    {
      code: "REGION_ALLOWED",
      passes: RULES.allowedRegions.has(property.region)
    },
    {
      code: "VALUATION_MINIMUM",
      passes: property.valuation >= RULES.minimumValuation
    },
    {
      code: "NO_ENCUMBRANCE",
      passes: !RULES.requireNoEncumbrance || property.noEncumbrance === true
    },
    {
      code: "ACTIVE_STATUS",
      passes: property.status === RULES.requiredStatus
    }
  ];

  return {
    passes: checks.every((check) => check.passes),
    checks,
    reasons: checks.filter((check) => !check.passes).map((check) => check.code)
  };
}

function evaluateLtv(propertyValue, loanPrincipal) {
  const value = BigInt(propertyValue);
  const principal = BigInt(loanPrincipal);
  return {
    compliant: principal * 100n <= value * 80n,
    maxPrincipal: (value * 80n) / 100n,
    ltvBps: value === 0n ? 0n : (principal * 10_000n) / value
  };
}

async function buildVerification(propertyId) {
  const property = findProperty(propertyId);
  const evaluation = evaluateProperty(property);
  const key = propertyKey(propertyId);
  const valuationSalt = property ? valuationSaltForProperty(property) : 0n;
  const valuationCommitment = property
    ? await computeValuationCommitment(fieldFromBytes32(key), property.valuation, valuationSalt)
    : 0n;

  return {
    propertyId,
    propertyKey: key,
    exists: Boolean(property),
    verified: evaluation.passes,
    evidenceHash: property ? evidenceHashFor(property) : ethers.ZeroHash,
    valuationCommitment: valuationCommitment.toString(),
    evaluation,
    property: property || null
  };
}

async function buildCompliance(propertyId, loanPrincipal, principalSalt = randomFieldSalt()) {
  const principal = parsePositiveCircuitInteger(loanPrincipal, "loanPrincipal");
  const property = findProperty(propertyId);
  if (!property) {
    return {
      propertyId,
      propertyKey: propertyKey(propertyId),
      exists: false,
      compliant: false,
      reasons: ["PROPERTY_NOT_FOUND"],
      principalSalt: principalSalt.toString(),
      valuationCommitment: "0",
      principalCommitment: "0",
      publicSignals: []
    };
  }

  const key = propertyKey(propertyId);
  const valuationSalt = valuationSaltForProperty(property);
  const proofInputs = await buildProofInputs({
    propertyKey: key,
    propertyValue: property.valuation,
    loanPrincipal: principal,
    valuationSalt,
    principalSalt,
    maxLtvBps: MAX_LTV_BPS
  });
  const ltv = evaluateLtv(property.valuation, principal);

  return {
    propertyId,
    propertyKey: key,
    exists: true,
    compliant: ltv.compliant,
    maxPrincipal: ltv.maxPrincipal.toString(),
    ltvBps: ltv.ltvBps.toString(),
    valuationCommitment: proofInputs.valuationCommitment.toString(),
    principalCommitment: proofInputs.principalCommitment.toString(),
    principalSalt: proofInputs.principalSalt.toString(),
    publicSignals: [
      proofInputs.propertyKeyField.toString(),
      proofInputs.valuationCommitment.toString(),
      proofInputs.principalCommitment.toString(),
      proofInputs.maxLtvBps.toString()
    ],
    proofInputs
  };
}

module.exports = {
  RULES,
  loadProperties,
  findProperty,
  propertyKey,
  evidenceHashFor,
  evaluateProperty,
  evaluateLtv,
  parsePositiveCircuitInteger,
  buildVerification,
  buildCompliance
};
