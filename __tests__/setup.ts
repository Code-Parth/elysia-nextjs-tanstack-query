/**
 * Benchmark result type
 */
export interface BenchmarkResult {
  iterations: number;
  totalMs: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  opsPerSec: number;
}

/**
 * Performance measurement utilities
 */
export const perf = {
  /**
   * Measure execution time of an async function
   */
  async measure<T>(
    fn: () => Promise<T>,
  ): Promise<{ result: T; timeMs: number }> {
    const start = performance.now();
    const result = await fn();
    const timeMs = performance.now() - start;
    return { result, timeMs };
  },

  /**
   * Run a function multiple times and return statistics
   */
  async benchmark(
    fn: () => Promise<void>,
    iterations: number = 100,
  ): Promise<BenchmarkResult> {
    const times: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await fn();
      times.push(performance.now() - start);
    }

    times.sort((a, b) => a - b);

    const totalMs = times.reduce((a, b) => a + b, 0);
    const avgMs = totalMs / iterations;

    return {
      iterations,
      totalMs,
      avgMs,
      minMs: times[0],
      maxMs: times[times.length - 1],
      p50Ms: times[Math.floor(iterations * 0.5)],
      p95Ms: times[Math.floor(iterations * 0.95)],
      p99Ms: times[Math.floor(iterations * 0.99)],
      opsPerSec: Math.round(1000 / avgMs),
    };
  },

  /**
   * Format benchmark results as a table row
   */
  formatResult(name: string, stats: BenchmarkResult) {
    return {
      name,
      "ops/sec": stats.opsPerSec.toLocaleString(),
      "avg (ms)": stats.avgMs.toFixed(3),
      "p50 (ms)": stats.p50Ms.toFixed(3),
      "p95 (ms)": stats.p95Ms.toFixed(3),
      "p99 (ms)": stats.p99Ms.toFixed(3),
    };
  },
};

/**
 * Memory usage utilities
 */
export const memory = {
  /**
   * Get current heap usage in MB
   */
  getUsageMB(): number {
    if (typeof process !== "undefined" && process.memoryUsage) {
      return process.memoryUsage().heapUsed / 1024 / 1024;
    }
    return 0;
  },

  /**
   * Measure memory delta during a function execution
   */
  async measureDelta<T>(
    fn: () => Promise<T>,
  ): Promise<{ result: T; deltaMB: number }> {
    const before = memory.getUsageMB();
    const result = await fn();
    const after = memory.getUsageMB();
    return { result, deltaMB: after - before };
  },
};

/**
 * DX Metrics counter - counts lines of code for comparison
 */
export const dxMetrics = {
  countLines(code: string): number {
    return code.split("\n").filter((line) => line.trim().length > 0).length;
  },

  countStateVariables(code: string): number {
    const matches = code.match(/useState/g);
    return matches ? matches.length : 0;
  },

  hasTryCatch(code: string): boolean {
    return code.includes("try {") || code.includes("try{");
  },

  hasManualLoading(code: string): boolean {
    return code.includes("setLoading") || code.includes("isLoading:");
  },
};
