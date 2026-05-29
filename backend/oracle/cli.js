#!/usr/bin/env node

const {
  listProperties,
  verifyProperty,
  checkCompliance,
  runVerificationAndCompliance
} = require("./service");

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const flags = {
    write: rest.includes("--write"),
    network: "localhost"
  };

  const networkIndex = rest.indexOf("--network");
  if (networkIndex >= 0 && rest[networkIndex + 1]) {
    flags.network = rest[networkIndex + 1];
  }

  const saltIndex = rest.indexOf("--principal-salt");
  if (saltIndex >= 0 && rest[saltIndex + 1]) {
    flags.principalSalt = rest[saltIndex + 1];
  }

  const values = rest.filter((value, index) => {
    if (value.startsWith("--")) return false;
    if (rest[index - 1] === "--network" || rest[index - 1] === "--principal-salt") return false;
    return true;
  });

  return { command, values, flags };
}

function jsonReplacer(_key, value) {
  return typeof value === "bigint" ? value.toString() : value;
}

function print(value) {
  console.log(JSON.stringify(value, jsonReplacer, 2));
}

function usage() {
  console.log(`
Usage:
  node backend/oracle/cli.js list
  node backend/oracle/cli.js verify PROP-001 [--write] [--network localhost|sepolia]
  node backend/oracle/cli.js compliance PROP-001 750000 [--write] [--principal-salt 12345] [--network localhost|sepolia]
  node backend/oracle/cli.js e2e PROP-001 750000 [--write] [--network localhost|sepolia]
`);
}

async function main() {
  const { command, values, flags } = parseArgs(process.argv.slice(2));

  if (command === "list") {
    print(await listProperties());
    return;
  }

  if (command === "verify") {
    const [propertyId] = values;
    if (!propertyId) return usage();
    print(await verifyProperty(propertyId, flags));
    return;
  }

  if (command === "compliance") {
    const [propertyId, principal] = values;
    if (!propertyId || !principal) return usage();
    print(await checkCompliance(propertyId, principal, flags));
    return;
  }

  if (command === "e2e") {
    const [propertyId, principal] = values;
    if (!propertyId || !principal) return usage();
    print(await runVerificationAndCompliance(propertyId, principal, flags));
    return;
  }

  usage();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
