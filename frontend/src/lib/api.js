const API_URL = import.meta.env.VITE_ORACLE_API_URL || "http://localhost:8787";

function propertyQuery({ ownerAddress, network, role } = {}) {
  const params = new URLSearchParams();
  if (ownerAddress) params.set("owner", ownerAddress);
  if (network) params.set("network", network);
  if (role) params.set("role", role);
  const query = params.toString();
  return query ? `?${query}` : "";
}

export async function getPropertiesForRole(network = "localhost", role) {
  if (role !== "admin" && role !== "loanOfficer") return [];
  try {
    const response = await fetch(`${API_URL}/properties${propertyQuery({ network, role })}`);
    if (!response.ok) throw new Error("Oracle API unavailable");
    return await response.json();
  } catch (_error) {
    return [];
  }
}

export async function getPropertiesByOwner(ownerAddress, network = "localhost") {
  if (!ownerAddress) return [];
  try {
    const response = await fetch(`${API_URL}/properties${propertyQuery({ ownerAddress, network })}`);
    if (!response.ok) throw new Error("Oracle API unavailable");
    return await response.json();
  } catch (_error) {
    return [];
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
