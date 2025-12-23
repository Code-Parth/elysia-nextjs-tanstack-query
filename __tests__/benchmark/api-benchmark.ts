import { app } from "@/app/api/[[...slug]]/route";
import { api } from "@/lib/eden";

/**
 * Performance Benchmarks for Raw Elysia/Eden API
 *
 * This runs an incremental load test for 5 minutes, measuring:
 * - Requests per second at different concurrency levels
 * - Latency percentiles (p50, p95, p99)
 * - Throughput over time
 *
 * Run with: bun run __tests__/benchmark/api-benchmark.ts
 */

// ============================================
// Configuration
// ============================================

const DURATION_MINUTES = 5;
const DURATION_MS = DURATION_MINUTES * 60 * 1000;
const CONCURRENCY_LEVELS = [1, 5, 10, 25, 50, 100];
const PHASE_DURATION_MS = DURATION_MS / CONCURRENCY_LEVELS.length;

// ============================================
// Types
// ============================================

interface BenchmarkResult {
  phase: number;
  concurrency: number;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  durationMs: number;
  requestsPerSecond: number;
  avgLatencyMs: number;
  minLatencyMs: number;
  maxLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
}

// ============================================
// Benchmark Runner
// ============================================

async function runBenchmark(
  name: string,
  requestFn: () => Promise<void>,
  concurrency: number,
  durationMs: number,
): Promise<BenchmarkResult> {
  const latencies: number[] = [];
  let successCount = 0;
  let failCount = 0;
  let running = true;

  const startTime = performance.now();
  const endTime = startTime + durationMs;

  // Worker function
  async function worker() {
    while (running && performance.now() < endTime) {
      const reqStart = performance.now();
      try {
        await requestFn();
        successCount++;
        latencies.push(performance.now() - reqStart);
      } catch {
        failCount++;
      }
    }
  }

  // Start workers
  const workers = Array(concurrency)
    .fill(0)
    .map(() => worker());

  // Wait for all workers to complete
  await Promise.all(workers);
  running = false;

  const actualDuration = performance.now() - startTime;

  // Calculate statistics
  latencies.sort((a, b) => a - b);
  const totalRequests = successCount + failCount;

  return {
    phase: 0,
    concurrency,
    totalRequests,
    successfulRequests: successCount,
    failedRequests: failCount,
    durationMs: actualDuration,
    requestsPerSecond: (totalRequests / actualDuration) * 1000,
    avgLatencyMs:
      latencies.length > 0
        ? latencies.reduce((a, b) => a + b, 0) / latencies.length
        : 0,
    minLatencyMs: latencies[0] ?? 0,
    maxLatencyMs: latencies[latencies.length - 1] ?? 0,
    p50LatencyMs: latencies[Math.floor(latencies.length * 0.5)] ?? 0,
    p95LatencyMs: latencies[Math.floor(latencies.length * 0.95)] ?? 0,
    p99LatencyMs: latencies[Math.floor(latencies.length * 0.99)] ?? 0,
  };
}

// ============================================
// Request Functions
// ============================================

async function directGetRequest() {
  const response = await app.handle(new Request("http://localhost/api"));
  await response.text();
}

async function directPostRequest() {
  const response = await app.handle(
    new Request("http://localhost/api/user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Test User" }),
    }),
  );
  await response.json();
}

async function edenGetRequest() {
  const result = await api.get();
  if (result.error) throw result.error;
}

async function edenPostRequest() {
  const result = await api.user.post({ name: "Test User" });
  if (result.error) throw result.error;
}

// ============================================
// Report Formatting
// ============================================

function formatNumber(n: number, decimals = 2): string {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function printHeader() {
  console.log("\n");
  console.log("=".repeat(80));
  console.log("  ELYSIA/EDEN RAW API PERFORMANCE BENCHMARK");
  console.log("=".repeat(80));
  console.log(
    `  Duration: ${DURATION_MINUTES} minutes | Phases: ${CONCURRENCY_LEVELS.length} | Concurrency: ${CONCURRENCY_LEVELS.join(", ")}`,
  );
  console.log("=".repeat(80));
  console.log("\n");
}

function printPhaseResult(name: string, result: BenchmarkResult) {
  console.log(
    `\n✅ [Phase ${result.phase}] ${name} @ ${result.concurrency} concurrent`,
  );

  console.table({
    Requests: {
      Total: formatNumber(result.totalRequests, 0),
      Failed: formatNumber(result.failedRequests, 0),
    },
    Throughput: {
      "req/sec": formatNumber(result.requestsPerSecond, 0),
    },
    "Latency (ms)": {
      Avg: formatNumber(result.avgLatencyMs, 3),
      P50: formatNumber(result.p50LatencyMs, 3),
      P95: formatNumber(result.p95LatencyMs, 3),
      P99: formatNumber(result.p99LatencyMs, 3),
    },
  });
}

function printSummary(results: { name: string; results: BenchmarkResult[] }[]) {
  console.log("\n");
  console.log("=".repeat(80));
  console.log("  SUMMARY");
  console.log("=".repeat(80));

  const summaryTable = results.reduce(
    (acc, { name, results: benchResults }) => {
      const totalRequests = benchResults.reduce(
        (s, r) => s + r.totalRequests,
        0,
      );
      const avgRps =
        benchResults.reduce((s, r) => s + r.requestsPerSecond, 0) /
        benchResults.length;
      const avgLatency =
        benchResults.reduce((s, r) => s + r.avgLatencyMs, 0) /
        benchResults.length;

      acc[name] = {
        "Total Requests": formatNumber(totalRequests, 0),
        "Avg req/sec": formatNumber(avgRps, 0),
        "Avg Latency (ms)": formatNumber(avgLatency, 3),
      };
      return acc;
    },
    {} as Record<string, Record<string, string>>,
  );

  console.table(summaryTable);
}

// ============================================
// Main Benchmark
// ============================================

async function main() {
  printHeader();

  const allResults: { name: string; results: BenchmarkResult[] }[] = [];

  // Benchmark configurations
  const benchmarks = [
    { name: "Direct GET (app.handle)", fn: directGetRequest },
    { name: "Direct POST (app.handle)", fn: directPostRequest },
    { name: "Eden GET", fn: edenGetRequest },
    { name: "Eden POST", fn: edenPostRequest },
  ];

  for (const benchmark of benchmarks) {
    console.log(`\n🚀 Starting benchmark: ${benchmark.name}`);
    console.log("─".repeat(60));

    const results: BenchmarkResult[] = [];

    for (let i = 0; i < CONCURRENCY_LEVELS.length; i++) {
      const concurrency = CONCURRENCY_LEVELS[i];
      console.log(
        `\n⏳ Phase ${i + 1}/${CONCURRENCY_LEVELS.length}: ${concurrency} concurrent connections...`,
      );

      const result = await runBenchmark(
        benchmark.name,
        benchmark.fn,
        concurrency,
        PHASE_DURATION_MS,
      );

      result.phase = i + 1;
      results.push(result);
      printPhaseResult(benchmark.name, result);
    }

    allResults.push({ name: benchmark.name, results });
  }

  printSummary(allResults);

  console.log("\n✅ Benchmark completed successfully!\n");

  // Graceful exit
  process.exit(0);
}

// Run
main().catch((error) => {
  console.error("Benchmark failed:", error);
  process.exit(1);
});
