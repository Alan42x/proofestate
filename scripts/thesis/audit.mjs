import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const title = "ProofEstate: Blockchain-Based Real Estate Lending Platform with ZK Compliance and Property Verification";
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const files = ["thesis/thesis.md", "thesis/jisa.md"];

for (const name of files) {
  const source = read(name);
  assert.equal(source.split("\n")[0], `# ${title}`, `${name}: title`);
  const [body, bibliography] = source.split("## References\n");
  assert.ok(bibliography, `${name}: references section`);
  const references = [...bibliography.matchAll(/^\[(\d+)\]/gm)].map((m) => Number(m[1]));
  assert.deepEqual(references, references.map((_, i) => i + 1), `${name}: reference sequence`);
  const cited = new Set();
  for (const match of body.matchAll(/\[(\d+(?:(?:,|--|–|-)\d+)*)\]/g)) {
    for (const part of match[1].split(",")) {
      const [first, last = first] = part.split(/--|–|-/).map(Number);
      for (let id = first; id <= last; id += 1) {
        assert.ok(references.includes(id), `${name}: missing reference ${id}`);
        cited.add(id);
      }
    }
  }
  assert.equal(cited.size, references.length, `${name}: uncited reference`);
  const images = [...source.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)];
  for (const match of images) {
    assert.ok(fs.existsSync(path.resolve(root, path.dirname(name), match[1])), `${name}: missing figure ${match[1]}`);
    assert.ok(match[1].startsWith("../docs/"), `${name}: figures must share docs sources`);
  }
  const captions = [...source.matchAll(/^\*Table (\d+)\./gm)].map((m) => Number(m[1]));
  const tables = source.split("\n").filter((line) => /^\|\s*:?-/.test(line)).length;
  assert.deepEqual(captions, Array.from({ length: tables }, (_, i) => i + 1), `${name}: table captions`);
  const figureNumbers = [...source.matchAll(/^\*Figure (\d+)\./gm)].map((m) => Number(m[1]));
  assert.deepEqual(figureNumbers, Array.from({ length: images.length }, (_, i) => i + 1), `${name}: figure captions`);
  console.log(`${name}: title, ${references.length} references, ${tables} tables, ${images.length} figures OK`);
}

const jisa = read("thesis/jisa.md");
const abstract = jisa.split("## Abstract\n\n")[1].split("\n\n## Keywords")[0];
const wordCount = abstract.trim().split(/\s+/).length;
assert.ok(wordCount <= 250, "Abstract exceeds 250 words");
const keywords = jisa.split("## Keywords\n\n")[1].split("\n\n")[0].split(";");
assert.equal(keywords.length, 6);
console.log(`JISA abstract: ${wordCount} words; keywords: ${keywords.length}`);

const quantile = (sorted, p) => sorted[Math.ceil(p * sorted.length) - 1];
const near = (actual, expected, description) => assert.ok(Math.abs(actual - expected) < 1e-6, description);
const rawFiles = fs.readdirSync(path.join(root, "docs/benchmarks/raw")).filter((name) => name.endsWith(".json")).sort();
const archivedFiles = [...read("docs/benchmarks/final-benchmarks.md").matchAll(/`(docs\/benchmarks\/raw\/[^`]+\.json)`/g)]
  .map((match) => match[1]);
assert.ok(archivedFiles.length > 0, "Benchmark report must identify its raw evidence files");
for (const filename of archivedFiles) {
  assert.ok(fs.existsSync(path.join(root, filename)), `Missing archived evidence: ${filename}`);
}
for (const name of rawFiles) {
  const filename = `docs/benchmarks/raw/${name}`;
  const data = JSON.parse(read(filename));
  for (const [stage, summary] of Object.entries(data.summaries)) {
    const samples = data.rawSamples.filter((sample) => sample.label === `measured:${stage}` && !sample.skipped);
    const values = samples.map((sample) => sample.durationMs).sort((a, b) => a - b);
    assert.equal(summary.runs, data.methodology.measuredRuns, `${name}: sample count`);
    assert.equal(samples.length, summary.runs);
    assert.equal(summary.failures, samples.filter((s) => s.ok === false).length);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    near(summary.meanMs, mean, `${name}: mean`);
    near(summary.medianMs, quantile(values, 0.5), `${name}: nearest-rank median`);
    near(summary.minMs, values[0], `${name}: min`);
    near(summary.maxMs, values.at(-1), `${name}: max`);
    near(summary.stddevMs, Math.sqrt(values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length), `${name}: standard deviation`);
    if (values.length >= 20) near(summary.p95Ms, quantile(values, 0.95), `${name}: P95`);
    else assert.equal(summary.p95Ms, null);
  }
}

console.log(`All ${rawFiles.length} timing files recomputed successfully; referenced archives are present. No files were written.`);
