const API_URL = import.meta.env.VITE_ORACLE_API_URL || "http://localhost:8787";

export const fallbackProperties = [
  {
    propertyId: "PROP-001",
    address: "Tanjong Pagar mixed-use tower, unit A-1201",
    region: "SG-CCR",
    valuation: 980000,
    ownerAddress: "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
    esgScore: 82,
    noEncumbrance: true,
    status: "ACTIVE"
  },
  {
    propertyId: "PROP-002",
    address: "Queenstown residential block, unit B-0804",
    region: "SG-RCR",
    valuation: 720000,
    ownerAddress: "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
    esgScore: 76,
    noEncumbrance: true,
    status: "ACTIVE"
  },
  {
    propertyId: "PROP-004",
    address: "Orchard Road retail micro-unit, lot D-0110",
    region: "SG-CCR",
    valuation: 450000,
    ownerAddress: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
    esgScore: 64,
    noEncumbrance: false,
    status: "ACTIVE"
  },
  {
    propertyId: "PROP-009",
    address: "Clementi residential unit, unit I-1103",
    region: "SG-RCR",
    valuation: 195000,
    ownerAddress: "0x976EA74026E726554dB657fA54763abd0C3a0aa9",
    esgScore: 67,
    noEncumbrance: true,
    status: "ACTIVE"
  }
];

export async function getProperties() {
  try {
    const response = await fetch(`${API_URL}/properties`);
    if (!response.ok) throw new Error("Oracle API unavailable");
    return await response.json();
  } catch (_error) {
    return fallbackProperties;
  }
}

export async function getPropertiesByOwner(ownerAddress) {
  const normalizedOwner = ownerAddress?.toLowerCase();
  try {
    const query = ownerAddress ? `?owner=${encodeURIComponent(ownerAddress)}` : "";
    const response = await fetch(`${API_URL}/properties${query}`);
    if (!response.ok) throw new Error("Oracle API unavailable");
    return await response.json();
  } catch (_error) {
    if (!normalizedOwner) return fallbackProperties;
    return fallbackProperties.filter(
      (property) => property.ownerAddress?.toLowerCase() === normalizedOwner
    );
  }
}

export async function getOracleHealth() {
  const response = await fetch(`${API_URL}/health`);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || "Oracle API unavailable");
  }
  return body;
}

export async function postOracle(path, payload) {
  const response = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || "Oracle request failed");
  }
  return body;
}
