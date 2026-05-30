require("dotenv").config();

const express = require("express");
const cors = require("cors");
const {
  listProperties,
  verifyProperty,
  checkCompliance,
  runVerificationAndCompliance
} = require("./service");

const app = express();
const port = Number(process.env.ORACLE_PORT || 8787);

app.use(cors());
app.use(express.json({ limit: "16kb" }));
app.set("json replacer", (_key, value) => (typeof value === "bigint" ? value.toString() : value));

app.get("/", (_req, res) => {
  res.type("html").send(`
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>ProofEstate Oracle API</title>
    <style>
      body {
        margin: 0;
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: #17211d;
        background: #f5f7f3;
      }
      main {
        max-width: 760px;
        margin: 0 auto;
        padding: 48px 22px;
      }
      h1 {
        margin: 0 0 10px;
        font-size: 2rem;
        letter-spacing: 0;
      }
      p {
        color: #4c5a52;
        line-height: 1.6;
      }
      a {
        color: #1f6f61;
        font-weight: 750;
      }
      code {
        border-radius: 6px;
        background: #e8eee9;
        padding: 2px 6px;
      }
      .panel {
        margin-top: 24px;
        border: 1px solid #d7ddd7;
        border-radius: 8px;
        background: #fff;
        padding: 18px;
      }
      li {
        margin: 10px 0;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>ProofEstate Oracle API</h1>
      <p>This port is the backend oracle service. Open the DApp at <a href="http://localhost:5173/">http://localhost:5173/</a>.</p>
      <div class="panel">
        <strong>Useful endpoints</strong>
        <ul>
          <li><code>GET /health</code></li>
          <li><code>GET /properties</code></li>
          <li><code>GET /properties/PROP-001/verification</code></li>
          <li><code>POST /verify</code></li>
          <li><code>POST /compliance</code></li>
          <li><code>POST /e2e</code></li>
        </ul>
      </div>
    </main>
  </body>
</html>
`);
});

function asyncRoute(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "proofestate-oracle" });
});

app.get("/properties", asyncRoute(async (req, res) => {
  const owner = typeof req.query.owner === "string" ? req.query.owner.toLowerCase() : "";
  const properties = await listProperties();
  res.json(
    owner
      ? properties.filter((property) => property.ownerAddress?.toLowerCase() === owner)
      : properties
  );
}));

app.get("/properties/:propertyId/verification", asyncRoute(async (req, res) => {
  res.json(await verifyProperty(req.params.propertyId));
}));

app.post("/verify", asyncRoute(async (req, res) => {
  const { propertyId, write = false, network = "localhost" } = req.body;
  if (!propertyId) return res.status(400).json({ error: "propertyId is required" });
  res.json(await verifyProperty(propertyId, { write, network }));
}));

app.post("/compliance", asyncRoute(async (req, res) => {
  const { propertyId, loanPrincipal, write = false, network = "localhost", principalSalt } = req.body;
  if (!propertyId) return res.status(400).json({ error: "propertyId is required" });
  if (loanPrincipal === undefined || loanPrincipal === null || loanPrincipal === "") {
    return res.status(400).json({ error: "loanPrincipal is required" });
  }
  res.json(await checkCompliance(propertyId, loanPrincipal, { write, network, principalSalt }));
}));

app.post("/e2e", asyncRoute(async (req, res) => {
  const { propertyId, loanPrincipal, write = false, network = "localhost", principalSalt } = req.body;
  if (!propertyId) return res.status(400).json({ error: "propertyId is required" });
  if (loanPrincipal === undefined || loanPrincipal === null || loanPrincipal === "") {
    return res.status(400).json({ error: "loanPrincipal is required" });
  }
  res.json(
    await runVerificationAndCompliance(propertyId, loanPrincipal, {
      write,
      network,
      principalSalt
    })
  );
}));

app.use((error, _req, res, _next) => {
  const statusCode = error.statusCode || 500;
  if (statusCode >= 500) {
    console.error(error);
  }
  res.status(statusCode).json({
    error: error.message || "Internal server error"
  });
});

if (require.main === module) {
  app.listen(port, () => {
    console.log(`Oracle API listening on http://localhost:${port}`);
  });
}

module.exports = app;
