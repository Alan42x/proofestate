import { keccak256, toHex } from "viem";

export function propertyKey(propertyId) {
  return keccak256(toHex(propertyId));
}

export function roleKey(roleName) {
  return keccak256(toHex(roleName));
}

export function shortHash(value) {
  if (!value || value === "0x") return "-";
  if (!String(value).startsWith("0x") || String(value).length < 18) return value;
  return `${value.slice(0, 10)}...${value.slice(-6)}`;
}

export function shortField(value) {
  if (value === undefined || value === null || value === "" || value === 0 || value === 0n) {
    return "-";
  }
  const hex = BigInt(value).toString(16).padStart(64, "0");
  return shortHash(`0x${hex}`);
}

export function formatRecord(record) {
  if (!record) {
    return {
      verified: false,
      compliant: false,
      owner: "-",
      evidenceHash: "-",
      complianceHash: "-",
      valuationCommitment: "-",
      principalCommitment: "-",
      principalCommitmentRaw: 0n,
      lastUpdated: "-"
    };
  }

  const lastUpdated = Number(record.lastUpdated || 0n);
  return {
    verified: record.verified,
    compliant: record.compliant,
    owner: shortHash(record.owner),
    evidenceHash: shortHash(record.evidenceHash),
    complianceHash: shortHash(record.complianceHash),
    valuationCommitment: shortField(record.valuationCommitment),
    principalCommitment: shortField(record.principalCommitment),
    principalCommitmentRaw: record.principalCommitment || 0n,
    lastUpdated: lastUpdated
      ? new Date(lastUpdated * 1000).toLocaleString()
      : "-"
  };
}
