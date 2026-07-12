const os = require("node:os");

const DEFAULT_WARNING_FREE_MEMORY_MB = 768;
const DEFAULT_MIN_FREE_MEMORY_MB = 256;
const DEFAULT_WARNING_PROCESS_RSS_MB = 1024;
const DEFAULT_MAX_PROCESS_RSS_MB = 1536;
const DEFAULT_MEMORY_RECOVERY_WAIT_MS = 2500;
const DEFAULT_MEMORY_RECOVERY_POLL_MS = 250;

function bytesToMegabytes(value) {
  return Number((value / 1024 / 1024).toFixed(1));
}

function readPositiveNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function createResourceMonitor({
  warningFreeMemoryMb = readPositiveNumber(
    process.env.NEWS_AGG_WARNING_FREE_MEMORY_MB,
    DEFAULT_WARNING_FREE_MEMORY_MB,
  ),
  minFreeMemoryMb = readPositiveNumber(
    process.env.NEWS_AGG_MIN_FREE_MEMORY_MB,
    DEFAULT_MIN_FREE_MEMORY_MB,
  ),
  warningProcessRssMb = readPositiveNumber(
    process.env.NEWS_AGG_WARNING_PROCESS_RSS_MB,
    DEFAULT_WARNING_PROCESS_RSS_MB,
  ),
  maxProcessRssMb = readPositiveNumber(
    process.env.NEWS_AGG_MAX_PROCESS_RSS_MB,
    DEFAULT_MAX_PROCESS_RSS_MB,
  ),
  recoveryWaitMs = readPositiveNumber(
    process.env.NEWS_AGG_MEMORY_RECOVERY_WAIT_MS,
    DEFAULT_MEMORY_RECOVERY_WAIT_MS,
  ),
  recoveryPollMs = readPositiveNumber(
    process.env.NEWS_AGG_MEMORY_RECOVERY_POLL_MS,
    DEFAULT_MEMORY_RECOVERY_POLL_MS,
  ),
} = {}) {
  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  const monitor = {
    getMemoryState() {
      const memoryUsage = process.memoryUsage();
      const systemFreeMemory = os.freemem();
      const systemTotalMemory = os.totalmem();
      const systemFreeMemoryMb = bytesToMegabytes(systemFreeMemory);
      const systemTotalMemoryMb = bytesToMegabytes(systemTotalMemory);
      const rssMb = bytesToMegabytes(memoryUsage.rss);
      const heapUsedMb = bytesToMegabytes(memoryUsage.heapUsed);
      const reasons = [];
      const criticalReasons = [];

      // Deliberately not gating on systemFreeMemoryMb (os.freemem()): on
      // macOS (and to a lesser extent Linux) it counts reclaimable
      // file-cache pages as "used", so it reads as critically low on
      // healthy machines and throttled refreshes for everyone. Process RSS
      // below is self-reported and doesn't have that platform quirk, so it
      // stays as the real memory-pressure signal. systemFreeMemoryMb is
      // still computed/returned for display purposes.

      if (rssMb > warningProcessRssMb) {
        reasons.push(`process RSS above ${warningProcessRssMb} MB`);
      }

      if (rssMb > maxProcessRssMb) {
        criticalReasons.push(`process RSS above ${maxProcessRssMb} MB`);
      }

      return {
        constrained: reasons.length > 0 || criticalReasons.length > 0,
        critical: criticalReasons.length > 0,
        severity: criticalReasons.length ? "critical" : reasons.length ? "warning" : "ok",
        reasons: [...criticalReasons, ...reasons],
        criticalReasons,
        rssMb,
        heapUsedMb,
        systemFreeMemoryMb,
        systemTotalMemoryMb,
        warningFreeMemoryMb,
        minFreeMemoryMb,
        warningProcessRssMb,
        maxProcessRssMb,
      };
    },
    async waitForMemoryRecovery({
      maxWaitMs = recoveryWaitMs,
      pollMs = recoveryPollMs,
    } = {}) {
      const startedAt = Date.now();
      let memoryState = monitor.getMemoryState();

      while (memoryState.constrained && Date.now() - startedAt < maxWaitMs) {
        if (typeof global.gc === "function") {
          global.gc();
        }

        await sleep(pollMs);
        memoryState = monitor.getMemoryState();

        if (!memoryState.critical) {
          break;
        }
      }

      return {
        waitedMs: Date.now() - startedAt,
        memoryState,
      };
    },
    start() {
      return {
        cpuUsage: process.cpuUsage(),
        memoryUsage: process.memoryUsage(),
        systemFreeMemory: os.freemem(),
        startedAt: process.hrtime.bigint(),
      };
    },
    finish(sample) {
      if (!sample) {
        return null;
      }

      const durationNs = process.hrtime.bigint() - sample.startedAt;
      const durationMs = Number(durationNs) / 1_000_000;
      const cpuUsage = process.cpuUsage(sample.cpuUsage);
      const memoryUsage = process.memoryUsage();
      const systemFreeMemory = os.freemem();
      const cpuTotalMs = (cpuUsage.user + cpuUsage.system) / 1000;
      const durationForCpuMs = Math.max(durationMs, 1);

      return {
        durationMs: Number(durationMs.toFixed(0)),
        cpuUserMs: Number((cpuUsage.user / 1000).toFixed(1)),
        cpuSystemMs: Number((cpuUsage.system / 1000).toFixed(1)),
        cpuTotalMs: Number(cpuTotalMs.toFixed(1)),
        cpuPercent: Number(((cpuTotalMs / durationForCpuMs) * 100).toFixed(1)),
        rssMb: bytesToMegabytes(memoryUsage.rss),
        rssDeltaMb: bytesToMegabytes(memoryUsage.rss - sample.memoryUsage.rss),
        heapUsedMb: bytesToMegabytes(memoryUsage.heapUsed),
        heapUsedDeltaMb: bytesToMegabytes(
          memoryUsage.heapUsed - sample.memoryUsage.heapUsed,
        ),
        systemFreeMemoryMb: bytesToMegabytes(systemFreeMemory),
        systemFreeMemoryDeltaMb: bytesToMegabytes(
          systemFreeMemory - sample.systemFreeMemory,
        ),
      };
    },
  };

  return monitor;
}

module.exports = {
  createResourceMonitor,
};
