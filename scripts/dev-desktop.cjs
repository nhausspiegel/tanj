#!/usr/bin/env node

const { spawn } = require("node:child_process");
const http = require("node:http");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const HEALTH_URL = "http://127.0.0.1:3000/api/health";
const STARTUP_TIMEOUT_MS = 120_000;
const POLL_INTERVAL_MS = 500;
const PROBE_TIMEOUT_MS = 15_000;

const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
const electronBin = path.join(
  ROOT,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "electron.cmd" : "electron",
);

const children = new Set();
let shuttingDown = false;

function log(scope, message) {
  process.stdout.write(`[${scope}] ${message}\n`);
}

function spawnManaged(scope, command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: ROOT,
    env: process.env,
    stdio: "inherit",
    ...options,
  });

  children.add(child);
  child.once("exit", () => {
    children.delete(child);
  });
  child.once("error", (error) => {
    log(scope, error.message);
  });

  return child;
}

function terminateAll(signal = "SIGTERM") {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) {
      child.kill(signal);
    }
  }
}

function requestHealth() {
  return new Promise((resolve) => {
    const request = http.request(
      HEALTH_URL,
      { method: "GET", timeout: PROBE_TIMEOUT_MS },
      (response) => {
        response.resume();
        resolve(response.statusCode >= 200 && response.statusCode < 500);
      },
    );

    request.on("error", () => resolve(false));
    request.on("timeout", () => {
      request.destroy();
      resolve(false);
    });
    request.end();
  });
}

async function waitForHealth(webProcess) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < STARTUP_TIMEOUT_MS) {
    if (webProcess.exitCode !== null) {
      throw new Error("Next desktop renderer exited before becoming healthy.");
    }

    if (await requestHealth()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error(`Timed out waiting for ${HEALTH_URL}`);
}

function runCommand(scope, command, args) {
  return new Promise((resolve, reject) => {
    const child = spawnManaged(scope, command, args);

    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${scope} exited with ${signal ?? `code ${code}`}`));
      }
    });
  });
}

async function main() {
  process.on("SIGINT", () => {
    terminateAll("SIGINT");
    process.exit(130);
  });
  process.on("SIGTERM", () => {
    terminateAll("SIGTERM");
    process.exit(143);
  });

  log("web", "Starting Next desktop renderer");
  const web = spawnManaged("web", npmCmd, ["run", "dev:web:desktop"]);

  try {
    await waitForHealth(web);
    log("electron", "Building shared modules (clustering) for the main process");
    await runCommand("build:shared", npmCmd, ["run", "build:shared"]);
    log("electron", "Renderer is healthy; rebuilding native Electron modules");
    await runCommand("rebuild", npmCmd, ["run", "rebuild:electron"]);
    log("electron", "Starting Electron");
    const electron = spawnManaged("electron", electronBin, ["."], {
      env: {
        ...process.env,
        ELECTRON_RENDERER_URL: "http://127.0.0.1:3000",
      },
    });

    await new Promise((resolve, reject) => {
      web.once("exit", (code, signal) => {
        if (!shuttingDown) {
          terminateAll();
          reject(new Error(`web exited with ${signal ?? `code ${code}`}`));
        } else {
          resolve();
        }
      });
      electron.once("exit", (code, signal) => {
        if (!shuttingDown) {
          terminateAll();
          reject(new Error(`electron exited with ${signal ?? `code ${code}`}`));
        } else {
          resolve();
        }
      });
    });
  } catch (error) {
    terminateAll();
    throw error;
  }
}

main().catch((error) => {
  log("desktop", error instanceof Error ? error.message : "Desktop dev failed");
  process.exitCode = 1;
});
