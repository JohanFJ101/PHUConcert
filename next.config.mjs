// Next.js configuration.
//
// The MVP relies entirely on framework defaults: App Router routing,
// React Server Components, the dev server on port 3000, etc. This file
// exists as the single place to add future config (rewrites, image
// domains, experimental flags) without touching anything else.

import fs from "node:fs";
import path from "node:path";

// Function to read APP_BASE_URL from .env file directly before Next.js boots
function getAppBaseUrlFromEnv() {
  try {
    const envPath = path.resolve(process.cwd(), ".env");
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, "utf8");
      const match = content.match(/^APP_BASE_URL\s*=\s*["']?([^"'\r\n]+)["']?/m);
      if (match) {
        return match[1];
      }
    }
  } catch (error) {
    // Ignore errors
  }
  return process.env.APP_BASE_URL;
}

let allowedOrigins = [
  "192.168.0.102",
  "localhost",
  "192.168.0.102:3000",
  "localhost:3000"
];

const appBaseUrl = getAppBaseUrlFromEnv();
if (appBaseUrl) {
  try {
    const url = new URL(appBaseUrl);
    if (url.host) allowedOrigins.push(url.host);
    if (url.hostname) allowedOrigins.push(url.hostname);
  } catch (error) {
    // Ignore invalid URL
  }
}

console.log(">> Next.js Dev - Allowed Origins:", allowedOrigins);

/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: allowedOrigins
};

export default nextConfig;

