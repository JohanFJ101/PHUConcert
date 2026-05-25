#!/usr/bin/env node
/**
 * Updates APP_BASE_URL in .env for a Cloudflare HTTPS tunnel.
 *
 * Phone-based scanner testing requires an HTTPS origin (the browser
 * blocks camera access on plain HTTP except for localhost). This script
 * rewrites APP_BASE_URL so server-generated URLs match what the phone
 * sees through the tunnel.
 */

import fs from "node:fs";
import path from "node:path";

const ENV_KEY = "APP_BASE_URL";

function printUsage() {
  console.error(
    [
      "Usage:",
      "  npm run tunnel:env -- <https://your-url.trycloudflare.com>",
      "",
      "Options:",
      "  --env-file <path>  Update a different env file instead of .env.",
      "  --print-only       Print the value without writing a file."
    ].join("\n")
  );
}

function parseArgs(argv) {
  const parsed = {
    tunnelUrl: "",
    envFile: ".env",
    printOnly: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--env-file") {
      const next = argv[index + 1];
      if (!next) {
        throw new Error("Missing value for --env-file.");
      }
      parsed.envFile = next;
      index += 1;
      continue;
    }

    if (arg === "--print-only") {
      parsed.printOnly = true;
      continue;
    }

    if (!parsed.tunnelUrl) {
      parsed.tunnelUrl = arg;
      continue;
    }

    throw new Error(`Unexpected argument: ${arg}`);
  }

  if (!parsed.tunnelUrl) {
    throw new Error("Missing Cloudflare HTTPS URL.");
  }

  return parsed;
}

export function normalizeTunnelUrl(rawUrl) {
  const url = new URL(rawUrl);

  if (url.protocol !== "https:") {
    throw new Error("Cloudflare tunnel URL must start with https://.");
  }

  url.username = "";
  url.password = "";
  url.pathname = "/";
  url.search = "";
  url.hash = "";

  return url.toString().replace(/\/$/, "");
}

function quoteEnvValue(value) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function setEnvValue(content, key, value) {
  const line = `${key}=${quoteEnvValue(value)}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");

  if (pattern.test(content)) {
    return content.replace(pattern, line);
  }

  const separator = content.length > 0 && !content.endsWith("\n") ? "\n" : "";
  return `${content}${separator}${line}\n`;
}

export function updateTunnelEnvValues({ tunnelUrl, envFile = ".env", printOnly = false }) {
  const appBaseUrl = normalizeTunnelUrl(tunnelUrl);

  if (printOnly) {
    return {
      appBaseUrl,
      envPath: null
    };
  }

  const envPath = path.resolve(process.cwd(), envFile);
  const existing = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
  const updated = setEnvValue(existing, ENV_KEY, appBaseUrl);

  fs.writeFileSync(envPath, updated);

  return {
    appBaseUrl,
    envPath
  };
}

function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = updateTunnelEnvValues(args);

    if (args.printOnly) {
      console.log(`${ENV_KEY}=${quoteEnvValue(result.appBaseUrl)}`);
      return;
    }

    console.log(`Updated ${result.envPath}`);
    console.log("Restart the Next.js server so it reloads .env.");
  } catch (error) {
    console.error(error.message);
    console.error("");
    printUsage();
    process.exit(1);
  }
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}`) {
  main();
}
