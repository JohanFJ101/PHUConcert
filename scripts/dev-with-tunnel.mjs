#!/usr/bin/env node

import { spawn } from "node:child_process";
import process from "node:process";
import { updateTunnelEnvValues } from "./set-tunnel-env.mjs";

const PORT = process.env.PORT ?? "3000";
const HOSTNAME = process.env.HOSTNAME ?? "0.0.0.0";
const LOCAL_TARGET = `http://localhost:${PORT}`;
const TUNNEL_URL_PATTERN = /https:\/\/[-a-zA-Z0-9.]+\.trycloudflare\.com/;

let nextProcess = null;
let tunnelProcess = null;
let tunnelUrl = "";
let shuttingDown = false;

function command(name) {
  return process.platform === "win32" ? `${name}.cmd` : name;
}

function prefixLines(prefix, chunk) {
  const text = chunk.toString();
  for (const line of text.split(/\r?\n/)) {
    if (line.trim()) {
      console.log(`${prefix} ${line}`);
    }
  }
}

function startNext(url) {
  if (nextProcess) {
    return;
  }

  const redirectUri = `${url}/api/auth/google/callback`;
  const nextEnv = {
    ...process.env,
    APP_BASE_URL: url,
    GOOGLE_OAUTH_REDIRECT_URI: redirectUri
  };

  console.log("");
  console.log(`Cloudflare URL: ${url}`);
  console.log(`Google callback URI: ${redirectUri}`);
  console.log("Add that exact callback URI in Google Cloud Console if it is not already there.");
  console.log("");

  nextProcess = spawn(command("next"), ["dev", "--hostname", HOSTNAME, "-p", PORT], {
    env: nextEnv,
    stdio: ["inherit", "pipe", "pipe"],
    shell: false
  });

  nextProcess.stdout.on("data", (chunk) => prefixLines("[next]", chunk));
  nextProcess.stderr.on("data", (chunk) => prefixLines("[next]", chunk));
  nextProcess.on("exit", (code) => {
    if (!shuttingDown) {
      console.log(`[next] exited with code ${code ?? "unknown"}`);
      shutdown(code ?? 1);
    }
  });
}

function handleTunnelOutput(chunk) {
  const text = chunk.toString();
  prefixLines("[cloudflared]", text);

  if (tunnelUrl) {
    return;
  }

  const match = text.match(TUNNEL_URL_PATTERN);
  if (!match) {
    return;
  }

  tunnelUrl = match[0];
  const result = updateTunnelEnvValues({
    tunnelUrl,
    envFile: ".env",
    printOnly: false
  });

  console.log(`[env] Updated ${result.envPath}`);
  startNext(result.appBaseUrl);
}

function shutdown(code = 0) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  nextProcess?.kill();
  tunnelProcess?.kill();
  process.exit(code);
}

console.log(`Starting Cloudflare tunnel for ${LOCAL_TARGET}...`);
console.log("Next.js will start after Cloudflare prints the public HTTPS URL.");

tunnelProcess = spawn(command("cloudflared"), ["tunnel", "--url", LOCAL_TARGET], {
  stdio: ["inherit", "pipe", "pipe"],
  shell: false
});

tunnelProcess.stdout.on("data", handleTunnelOutput);
tunnelProcess.stderr.on("data", handleTunnelOutput);
tunnelProcess.on("exit", (code) => {
  if (!shuttingDown) {
    console.log(`[cloudflared] exited with code ${code ?? "unknown"}`);
    shutdown(code ?? 1);
  }
});

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
