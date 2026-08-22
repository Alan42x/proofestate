const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const app = require("./server");

let server;
let baseUrl;

before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

async function request(path, options) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const body = await response.json();
  return { response, body };
}

test("GET /health returns service readiness", async () => {
  const { response, body } = await request("/health");
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.service, "proofestate-oracle");
});

test("GET /properties supports owner filtering", async () => {
  const owner = "0x90F79bf6EB2c4f870365E785982E1f101E93b906";
  const { body: ownedProperties } = await request(`/properties?owner=${encodeURIComponent(owner)}`);
  assert.ok(ownedProperties.length > 0);
  assert.ok(ownedProperties.every((property) => property.ownerAddress.toLowerCase() === owner.toLowerCase()));
});

test("GET /properties rejects unscoped registry access", async () => {
  const { response, body } = await request("/properties");
  assert.equal(response.status, 400);
  assert.match(body.error, /owner or privileged role is required/);
});

test("GET /properties allows privileged registry access for demo roles", async () => {
  const { response, body } = await request("/properties?network=sepolia&role=loanOfficer");
  assert.equal(response.status, 200);
  assert.ok(body.length > 0);
  assert.ok(body.every((property) => property.network === "sepolia"));
  assert.ok(body.some((property) => property.propertyId === "PROP-011"));
});

test("GET /properties scopes assets by network", async () => {
  const localhostOwner = "0x90F79bf6EB2c4f870365E785982E1f101E93b906";
  const sepoliaOwner = "0x82b8C1c43E3310E1f46fbcd00582Aedf1CEe81a4";
  const localhost = await request(`/properties?network=localhost&owner=${encodeURIComponent(localhostOwner)}`);
  const sepolia = await request(`/properties?network=sepolia&owner=${encodeURIComponent(sepoliaOwner)}`);
  const localhostIds = localhost.body.map((property) => property.propertyId);
  const sepoliaIds = sepolia.body.map((property) => property.propertyId);

  assert.ok(localhostIds.includes("PROP-001"));
  assert.ok(!localhostIds.includes("PROP-011"));
  assert.ok(sepoliaIds.includes("PROP-011"));
  assert.ok(!sepoliaIds.includes("PROP-001"));
});

test("GET /properties rejects unsupported networks", async () => {
  const owner = "0x90F79bf6EB2c4f870365E785982E1f101E93b906";
  const { response, body } = await request(`/properties?network=mainnet&owner=${encodeURIComponent(owner)}`);
  assert.equal(response.status, 400);
  assert.match(body.error, /network must be one of: localhost, sepolia/);
});

test("POST /verify rejects unsupported networks", async () => {
  const { response, body } = await request("/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ propertyId: "PROP-001", network: "mainnet" })
  });

  assert.equal(response.status, 400);
  assert.match(body.error, /network must be one of: localhost, sepolia/);
});

test("POST /verify rejects missing property id", async () => {
  const { response, body } = await request("/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });

  assert.equal(response.status, 400);
  assert.match(body.error, /propertyId is required/);
});

test("POST /verify rejects non-string property ids without a server error", async () => {
  const { response, body } = await request("/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ propertyId: { id: "PROP-001" } })
  });

  assert.equal(response.status, 400);
  assert.match(body.error, /propertyId must be a non-empty string/);
});

test("POST /compliance rejects missing and invalid principal", async () => {
  const missing = await request("/compliance", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ propertyId: "PROP-001" })
  });
  assert.equal(missing.response.status, 400);
  assert.match(missing.body.error, /loanPrincipal is required/);

  const invalid = await request("/compliance", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ propertyId: "PROP-001", loanPrincipal: "not-a-number" })
  });
  assert.equal(invalid.response.status, 400);
  assert.match(invalid.body.error, /must be an integer/);

  const booleanPrincipal = await request("/compliance", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ propertyId: "PROP-001", loanPrincipal: true })
  });
  assert.equal(booleanPrincipal.response.status, 400);
  assert.match(booleanPrincipal.body.error, /must be an integer/);
});

test("POST /compliance returns a non-compliant result without proof generation", async () => {
  const { response, body } = await request("/compliance", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ propertyId: "PROP-001", loanPrincipal: "900000" })
  });

  assert.equal(response.status, 200);
  assert.equal(body.exists, true);
  assert.equal(body.compliant, false);
  assert.equal(body.proof, undefined);
});

test("POST /compliance requires the property to pass registry verification rules", async () => {
  const { response, body } = await request("/compliance", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ propertyId: "PROP-004", loanPrincipal: "100000" })
  });

  assert.equal(response.status, 200);
  assert.equal(body.exists, true);
  assert.equal(body.compliant, false);
  assert.deepEqual(body.reasons, ["NO_ENCUMBRANCE"]);
  assert.equal(body.proof, undefined);
});
