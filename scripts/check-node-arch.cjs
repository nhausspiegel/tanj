#!/usr/bin/env node
/*
 * preinstall guard — fail loudly when `npm install` runs under the wrong Node.
 *
 * This app ships native modules (better-sqlite3, rollup, electron) that are
 * compiled/downloaded per Node *version* AND per CPU *architecture*. On the
 * Apple Silicon dev machines this repo targets, there are commonly two Node
 * binaries on PATH at once — an arm64 one (/opt/homebrew/bin/node) and an
 * x86_64 one (/usr/local/bin/node, the Intel Homebrew build, which runs under
 * Rosetta). If install runs under the wrong one, the native binaries are built
 * for the wrong arch/ABI and blow up *later* with confusing errors:
 *   - "mach-o file, but is an incompatible architecture (have 'arm64', need 'x86_64')"
 *   - "NODE_MODULE_VERSION 127 ... requires NODE_MODULE_VERSION 145"
 *   - "Cannot find module '@rollup/rollup-darwin-arm64'"
 *
 * This runs under the *exact* Node doing the install, so it catches the
 * mismatch at its source and prints how to fix it. It is a no-op on real
 * Intel Macs, Linux, and Windows — it only trips when a machine is Apple
 * Silicon yet Node is x86_64, or when the Node major is unsupported.
 *
 * Set SKIP_NODE_ARCH_CHECK=1 to bypass (escape hatch for odd environments).
 */
"use strict";

if (process.env.SKIP_NODE_ARCH_CHECK === "1") process.exit(0);

const os = require("os");
const { execSync } = require("child_process");

const problems = [];

// 1) Node major must be 20 or 22 — electron-rebuild (via yargs) crashes on
//    Node >= 24, and the app is validated on 20/22 LTS. Mirrors package.json
//    "engines".
const major = Number(process.versions.node.split(".")[0]);
if (major < 20 || major > 22) {
  problems.push(
    `Node ${process.versions.node} is unsupported — use Node 20 or 22 LTS ` +
      `(Node >= 24 crashes electron-rebuild).`,
  );
}

// 2) On an Apple Silicon Mac, Node must itself be arm64. Node's own
//    os.arch()/process.arch report the *running* process's arch — under
//    Rosetta they report x86_64 same as process.arch, so they can never
//    disagree with the thing being checked and can't detect this. The
//    kernel-level `hw.optional.arm64` sysctl reports the actual hardware's
//    capability regardless of what arch the calling process was translated
//    to, which is the one signal that's actually independent.
if (os.platform() === "darwin") {
  let hwArm64 = "0";
  try {
    hwArm64 = execSync("sysctl -n hw.optional.arm64 2>/dev/null", {
      encoding: "utf8",
    }).trim();
  } catch {
    hwArm64 = "0"; // sysctl key absent → not Apple Silicon hardware
  }
  if (hwArm64 === "1" && process.arch !== "arm64") {
    problems.push(
      `This is an Apple Silicon Mac, but Node is running as ${process.arch} ` +
        `(the Intel Homebrew node at /usr/local, or Rosetta). Native modules ` +
        `will be built for the wrong architecture.`,
    );
  }
}

if (problems.length) {
  const nl = "\n";
  process.stderr.write(
    nl +
      "✖  Wrong Node for this project — install aborted." +
      nl +
      nl +
      problems.map((p) => "   - " + p).join(nl) +
      nl +
      nl +
      "   How to fix (Apple Silicon):" +
      nl +
      "     which -a node            # list every node on your PATH" +
      nl +
      "     /opt/homebrew/bin/node -v   # should be v20.x or v22.x (arm64)" +
      nl +
      "   Ensure /opt/homebrew/bin comes before /usr/local/bin in PATH" +
      nl +
      "   (or use `fnm use 22`), open a fresh shell, then re-run `npm install`." +
      nl +
      nl +
      "   Escape hatch: SKIP_NODE_ARCH_CHECK=1 npm install" +
      nl,
  );
  process.exit(1);
}
