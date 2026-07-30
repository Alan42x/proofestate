import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { performance } from "node:perf_hooks";

const require = createRequire(import.meta.url);
const {
  buildVerification,
  buildCompliance
} = require("../backend/oracle/properties.js");
const { generateComplianceProof } = require("../zk/prover.js");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");

function parseArg(name, fallback) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function numberArg(name, fallback) {
  const value = Number(parseArg(name, fallback));
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`--${name} must be a non-negative integer`);
  }
  return value;
}

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))];
}

function summarize(samples) {
  const values = samples.map((sample) => sample.durationMs);
  const failures = samples.filter((sample) => sample.ok === false).length;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return {
    runs: values.length,
    failures,
    minMs: Math.min(...values),
    maxMs: Math.max(...values),
    meanMs: mean,
    medianMs: percentile(values, 50),
    p95Ms: values.length >= 20 ? percentile(values, 95) : null,
    stddevMs: Math.sqrt(variance)
  };
}

async function timed(label, fn) {
  const startedAt = performance.now();
  try {
    await fn();
    return {
      label,
      durationMs: performance.now() - startedAt,
      ok: true
    };
  } catch (error) {
    return {
      label,
      durationMs: performance.now() - startedAt,
      ok: false,
      error: error.message
    };
  }
}

async function httpPost(apiUrl, route, body) {
  const response = await fetch(`${apiUrl}${route}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const json = await response.json();
  if (!response.ok) {
    throw new Error(`${route} failed: ${json.error || response.status}`);
  }
  return json;
}

function commandOutput(command, args) {
  try {
    return execFileSync(command, args, {
      cwd: rootDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }).trim();
  } catch (error) {
    return error.stdout?.toString().trim() || error.message;
  }
}

function gitStatus() {
  const short = commandOutput("git", ["status", "--short"]);
  return {
    commit: commandOutput("git", ["rev-parse", "HEAD"]),
    dirty: short.length > 0,
    statusShort: short
  };
}

function frontendBundleSizes() {
  const distDir = path.join(rootDir, "frontend", "dist");
  if (!fs.existsSync(distDir)) return [];
  return fs.readdirSync(path.join(distDir, "assets"))
    .map((asset) => {
      const assetPath = path.join(distDir, "assets", asset);
      return {
        asset,
        bytes: fs.statSync(assetPath).size
      };
    })
    .sort((a, b) => b.bytes - a.bytes);
}

async function main() {
  const warmups = numberArg("warmups", 5);
  const runs = numberArg("runs", 30);
  const network = parseArg("network", "localhost");
  const propertyId = parseArg("property", "PROP-001");
  const principal = parseArg("principal", "750000");
  const apiUrl = parseArg("api", "");

  const allSamples = [];
  const measuredSamples = [];

  for (let i = 0; i < warmups + runs; i += 1) {
    const measured = i >= warmups;
    const prefix = measured ? "measured" : "warmup";

    const verification = await timed(`${prefix}:buildVerification`, () =>
      buildVerification(propertyId, { network })
    );

    let complianceResult;
    const compliance = await timed(`${prefix}:buildComplianceInputs`, async () => {
      complianceResult = await buildCompliance(propertyId, principal, { network });
    });

    const shouldGenerateProof = complianceResult?.compliant && complianceResult?.proofInputs;

    const iterationSamples = [verification, compliance];
    if (shouldGenerateProof) {
      iterationSamples.push(
        await timed(`${prefix}:generateComplianceProof`, () =>
          generateComplianceProof(complianceResult.proofInputs)
        )
      );
    } else {
      iterationSamples.push({
        label: `${prefix}:generateComplianceProof`,
        durationMs: null,
        ok: true,
        skipped: true,
        reason: complianceResult?.reasons?.join(",") || "NON_COMPLIANT_OR_MISSING_PROOF_INPUTS"
      });
    }

    if (apiUrl) {
      iterationSamples.push(
        await timed(`${prefix}:apiVerify`, () =>
          httpPost(apiUrl, "/verify", { propertyId, network, write: false })
        )
      );
      iterationSamples.push(
        await timed(`${prefix}:apiCompliance`, () =>
          httpPost(apiUrl, "/compliance", {
            propertyId,
            loanPrincipal: principal,
            network,
            write: false
          })
        )
      );
    }

    allSamples.push(...iterationSamples);
    if (measured) measuredSamples.push(...iterationSamples);
  }

  const grouped = measuredSamples.reduce((acc, sample) => {
    if (sample.skipped || sample.durationMs === null) return acc;
    const label = sample.label.replace("measured:", "");
    acc[label] = acc[label] || [];
    acc[label].push(sample);
    return acc;
  }, {});

  const result = {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    methodology: {
      warmups,
      measuredRuns: runs,
      network,
      propertyId,
      principal,
      apiUrl: apiUrl || null
    },
    environment: {
      os: `${os.type()} ${os.release()} ${os.arch()}`,
      cpu: os.cpus()[0]?.model || "unknown",
      node: process.version,
      pnpm: commandOutput("pnpm", ["-v"]),
      hardhat: commandOutput("pnpm", ["exec", "hardhat", "--version"]),
      snarkjs: "see package lock / pnpm exec snarkjs output",
      git: gitStatus()
    },
    summaries: Object.fromEntries(
      Object.entries(grouped).map(([label, samples]) => [label, summarize(samples)])
    ),
    failures: allSamples
      .filter((sample) => sample.ok === false)
      .map(({ label, durationMs, error }) => ({ label, durationMs, error })),
    frontendBundleSizes: frontendBundleSizes(),
    rawSamples: allSamples
  };

  const outputDir = path.join(rootDir, "docs", "benchmarks", "raw");
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(
    outputDir,
    `local-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
  );
  fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`Wrote ${path.relative(rootDir, outputPath)}`);
  console.log(JSON.stringify(result.summaries, null, 2));

  if (result.failures.length > 0) {
    console.error(`Benchmark completed with ${result.failures.length} failed sample(s).`);
    for (const failure of result.failures) {
      console.error(`- ${failure.label}: ${failure.error}`);
    }
    return 1;
  }
  return 0;
}

main()
  .then((exitCode) => {
    process.exit(exitCode);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
