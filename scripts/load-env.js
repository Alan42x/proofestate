const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

function loadEnv() {
  const requestedPath = process.env.PROOFESTATE_ENV_FILE || process.env.DOTENV_CONFIG_PATH;
  const envPath = requestedPath || ".env.local";
  const resolved = path.resolve(process.cwd(), envPath);

  if (fs.existsSync(resolved)) {
    dotenv.config({ path: resolved });
    process.env.PROOFESTATE_LOADED_ENV_FILE = resolved;
    return resolved;
  }

  return "";
}

module.exports = loadEnv();
