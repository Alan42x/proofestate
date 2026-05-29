const crypto = require("crypto");

const SNARK_FIELD =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const MAX_LTV_BPS = 8000n;
const BASIS_POINTS = 10000n;
const VALUE_BITS = 64;
const PRODUCT_BITS = 80;

let mimcSpongePromise;

function mod(value) {
  const result = BigInt(value) % SNARK_FIELD;
  return result >= 0n ? result : result + SNARK_FIELD;
}

function hashToField(...parts) {
  const hash = crypto.createHash("sha256");
  for (const part of parts) {
    hash.update(String(part));
    hash.update("\0");
  }
  return mod(BigInt(`0x${hash.digest("hex")}`));
}

function fieldFromHex(hexValue) {
  return mod(BigInt(hexValue));
}

function fieldFromBytes32(bytes32Value) {
  return fieldFromHex(bytes32Value);
}

function deterministicSalt(...parts) {
  return hashToField("ProofEstate salt", ...parts);
}

function valuationSaltForProperty(property) {
  return deterministicSalt("valuation", property.propertyId, property.ownerHash);
}

function randomFieldSalt() {
  return mod(BigInt(`0x${crypto.randomBytes(32).toString("hex")}`));
}

async function getMimcSponge() {
  if (!mimcSpongePromise) {
    const { buildMimcSponge } = require("circomlibjs");
    mimcSpongePromise = buildMimcSponge();
  }
  return mimcSpongePromise;
}

function fieldElementToBigInt(F, value) {
  if (typeof value === "bigint") return mod(value);
  return mod(F.toObject(value));
}

async function mimcSponge(inputs) {
  const mimc = await getMimcSponge();
  const normalizedInputs = inputs.map((input) => mod(input));
  const result = mimc.multiHash(normalizedInputs, 0n, 1);
  const output = Array.isArray(result) ? result[0] : result;
  return fieldElementToBigInt(mimc.F, output);
}

async function computeValuationCommitment(propertyKeyField, propertyValue, valuationSalt) {
  return mimcSponge([propertyKeyField, propertyValue, valuationSalt]);
}

async function computePrincipalCommitment(propertyKeyField, loanPrincipal, principalSalt) {
  return mimcSponge([propertyKeyField, loanPrincipal, principalSalt]);
}

function toCircuitInput(inputs) {
  return Object.fromEntries(
    Object.entries(inputs).map(([key, value]) => [key, BigInt(value).toString()])
  );
}

async function buildProofInputs({
  propertyKey,
  propertyValue,
  loanPrincipal,
  valuationSalt,
  principalSalt = randomFieldSalt(),
  maxLtvBps = MAX_LTV_BPS
}) {
  const propertyKeyField = fieldFromBytes32(propertyKey);
  const propertyValueBigInt = BigInt(propertyValue);
  const loanPrincipalBigInt = BigInt(loanPrincipal);
  const valuationSaltBigInt = BigInt(valuationSalt);
  const principalSaltBigInt = BigInt(principalSalt);
  const maxLtvBpsBigInt = BigInt(maxLtvBps);

  const valuationCommitment = await computeValuationCommitment(
    propertyKeyField,
    propertyValueBigInt,
    valuationSaltBigInt
  );
  const principalCommitment = await computePrincipalCommitment(
    propertyKeyField,
    loanPrincipalBigInt,
    principalSaltBigInt
  );

  return {
    propertyKeyField,
    valuationCommitment,
    principalCommitment,
    maxLtvBps: maxLtvBpsBigInt,
    propertyValue: propertyValueBigInt,
    loanPrincipal: loanPrincipalBigInt,
    valuationSalt: valuationSaltBigInt,
    principalSalt: principalSaltBigInt
  };
}

module.exports = {
  SNARK_FIELD,
  MAX_LTV_BPS,
  BASIS_POINTS,
  VALUE_BITS,
  PRODUCT_BITS,
  mod,
  fieldFromBytes32,
  deterministicSalt,
  valuationSaltForProperty,
  randomFieldSalt,
  mimcSponge,
  computeValuationCommitment,
  computePrincipalCommitment,
  buildProofInputs,
  toCircuitInput
};
