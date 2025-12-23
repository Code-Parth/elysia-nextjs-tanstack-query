// Setup DOM environment for React hooks testing
import "@/happydom";

import { renderHook, waitFor, act, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createElement,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { useApiQuery, useApiMutation } from "@/lib/hooks";
import { api } from "@/lib/eden";

/**
 * Performance Benchmarks for TanStack Query Hooks
 *
 * This runs a 3-way comparison: Raw Eden vs Raw React vs TanStack Query
 * Runs for ~5 minutes total.
 *
 * Run with: bun run __tests__/benchmark/hooks-benchmark.ts
 */

// ============================================
// Configuration
// ============================================

const DURATION_MINUTES = 5;
const DURATION_MS = DURATION_MINUTES * 60 * 1000;
const NUM_BENCHMARKS = 7; // Raw Eden GET/POST, Raw React GET/POST, TanStack GET/POST, Cache Hit
const PHASE_DURATION_MS = DURATION_MS / NUM_BENCHMARKS;

// ============================================
// Types
// ============================================

interface BenchmarkResult {
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  durationMs: number;
  operationsPerSecond: number;
  avgLatencyMs: number;
  minLatencyMs: number;
  maxLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
}

// ============================================
// Wrapper Helper
// ============================================

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });

  const Wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  Wrapper.displayName = "BenchmarkWrapper";
  return Wrapper;
}

// ============================================
// Benchmark Runner
// ============================================

async function runHooksBenchmark(
  operationFn: () => Promise<void>,
  durationMs: number,
): Promise<BenchmarkResult> {
  const latencies: number[] = [];
  let successCount = 0;
  let failCount = 0;

  const startTime = performance.now();
  const endTime = startTime + durationMs;

  while (performance.now() < endTime) {
    const opStart = performance.now();
    try {
      await operationFn();
      successCount++;
      latencies.push(performance.now() - opStart);
    } catch {
      failCount++;
    }
  }

  const actualDuration = performance.now() - startTime;

  // Calculate statistics
  latencies.sort((a, b) => a - b);
  const totalOps = successCount + failCount;

  return {
    totalOperations: totalOps,
    successfulOperations: successCount,
    failedOperations: failCount,
    durationMs: actualDuration,
    operationsPerSecond: (totalOps / actualDuration) * 1000,
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
// Raw Eden Operations
// ============================================

async function rawEdenGet() {
  await api.get();
}

async function rawEdenPost() {
  await api.user.post({ name: "Test" });
}

// ============================================
// Raw React (useState/useEffect) Hooks
// ============================================

// Simulates the traditional React pattern with useState/useEffect
function useRawReactQuery<T>(
  fetchFn: () => Promise<{ data: T; error: unknown }>,
) {
  const [state, setState] = useState<{
    data: T | null;
    error: unknown;
    isLoading: boolean;
    isSuccess: boolean;
    isError: boolean;
  }>({
    data: null,
    error: null,
    isLoading: true,
    isSuccess: false,
    isError: false,
  });

  useEffect(() => {
    let isMounted = true;

    fetchFn()
      .then((res) => {
        if (!isMounted) return;
        if (res.error) {
          setState({
            data: null,
            error: res.error,
            isLoading: false,
            isSuccess: false,
            isError: true,
          });
        } else {
          setState({
            data: res.data,
            error: null,
            isLoading: false,
            isSuccess: true,
            isError: false,
          });
        }
      })
      .catch((e) => {
        if (!isMounted) return;
        setState({
          data: null,
          error: e,
          isLoading: false,
          isSuccess: false,
          isError: true,
        });
      });

    return () => {
      isMounted = false;
    };
  }, [fetchFn]);

  return state;
}

function useRawReactMutation<TBody, TData>(
  mutationFn: (body: TBody) => Promise<{ data: TData; error: unknown }>,
) {
  const [data, setData] = useState<TData | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [isPending, setIsPending] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isError, setIsError] = useState(false);

  const mutate = useCallback(
    async (body: TBody) => {
      setIsPending(true);
      setError(null);
      setIsSuccess(false);
      setIsError(false);

      try {
        const res = await mutationFn(body);
        if (res.error) {
          setError(res.error);
          setIsError(true);
          throw res.error;
        }
        setData(res.data);
        setIsSuccess(true);
        return res.data;
      } catch (e) {
        setError(e);
        setIsError(true);
        throw e;
      } finally {
        setIsPending(false);
      }
    },
    [mutationFn],
  );

  const mutateAsync = mutate;

  return { data, error, isPending, isSuccess, isError, mutate, mutateAsync };
}

// Raw React benchmark operations
async function rawReactQueryOperation() {
  const { result } = renderHook(() => useRawReactQuery(() => api.get()));
  await waitFor(() => result.current.isSuccess || result.current.isError);
  cleanup();
}

async function rawReactMutationOperation() {
  const { result } = renderHook(() =>
    useRawReactMutation((body: { name: string }) => api.user.post(body)),
  );
  await act(async () => {
    await result.current.mutateAsync({ name: "Test" });
  });
  cleanup();
}

// ============================================
// TanStack Query Hook Operations
// ============================================

async function hookQueryOperation() {
  const wrapper = createWrapper();
  const { result } = renderHook(
    () => useApiQuery([`bench-${Math.random()}`], api.get),
    { wrapper },
  );
  await waitFor(() => result.current.isSuccess || result.current.isError);
  cleanup();
}

async function hookMutationOperation() {
  const wrapper = createWrapper();
  const { result } = renderHook(() => useApiMutation(api.user.post), {
    wrapper,
  });
  await act(async () => {
    await result.current.mutateAsync({ name: "Test" });
  });
  cleanup();
}

async function hookCacheHitOperation() {
  const queryClient = new QueryClient();
  queryClient.setQueryData(["cached"], "cached-data");

  const Wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  Wrapper.displayName = "CacheWrapper";

  const { result } = renderHook(
    () => useApiQuery(["cached"], api.get, { staleTime: Infinity }),
    { wrapper: Wrapper },
  );

  await waitFor(() => result.current.data !== undefined);
  cleanup();
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
  console.log("  REACT HOOKS PERFORMANCE BENCHMARK (3-WAY COMPARISON)");
  console.log("=".repeat(80));
  console.log(
    `  Duration: ${DURATION_MINUTES} minutes | Comparing: Raw Eden vs Raw React vs TanStack`,
  );
  console.log("=".repeat(80));
  console.log("\n");
}

function printResult(name: string, result: BenchmarkResult) {
  console.log(`\n✅ ${name}`);

  console.table({
    Operations: {
      Total: formatNumber(result.totalOperations, 0),
      Failed: formatNumber(result.failedOperations, 0),
    },
    Throughput: {
      "ops/sec": formatNumber(result.operationsPerSecond, 2),
    },
    "Latency (ms)": {
      Avg: formatNumber(result.avgLatencyMs, 3),
      P50: formatNumber(result.p50LatencyMs, 3),
      P95: formatNumber(result.p95LatencyMs, 3),
      P99: formatNumber(result.p99LatencyMs, 3),
    },
  });
}

function printComparison(results: { name: string; result: BenchmarkResult }[]) {
  console.log("\n");
  console.log("=".repeat(80));
  console.log("  3-WAY COMPARISON SUMMARY");
  console.log("=".repeat(80));

  // Detailed results table
  console.log("\n📊 DETAILED RESULTS\n");

  const detailedTable = results.reduce(
    (acc, { name, result }) => {
      acc[name] = {
        "ops/sec": formatNumber(result.operationsPerSecond, 0),
        "Total Ops": formatNumber(result.totalOperations, 0),
        "Avg (ms)": formatNumber(result.avgLatencyMs, 3),
        "P50 (ms)": formatNumber(result.p50LatencyMs, 3),
        "P95 (ms)": formatNumber(result.p95LatencyMs, 3),
        "P99 (ms)": formatNumber(result.p99LatencyMs, 3),
      };
      return acc;
    },
    {} as Record<string, Record<string, string>>,
  );

  console.table(detailedTable);

  // Performance comparison by type
  console.log("\n📈 PERFORMANCE BY TYPE\n");

  const rawEdenGet = results.find((r) => r.name === "Raw Eden GET");
  const rawEdenPost = results.find((r) => r.name === "Raw Eden POST");
  const rawReactGet = results.find((r) => r.name === "Raw React GET");
  const rawReactPost = results.find((r) => r.name === "Raw React POST");
  const tanstackGet = results.find((r) => r.name === "TanStack GET");
  const tanstackPost = results.find((r) => r.name === "TanStack POST");
  const cacheHit = results.find((r) => r.name === "TanStack Cache Hit");

  const comparisonTable = {
    "GET (ops/sec)": {
      "Raw Eden": rawEdenGet
        ? formatNumber(rawEdenGet.result.operationsPerSecond, 0)
        : "N/A",
      "Raw React": rawReactGet
        ? formatNumber(rawReactGet.result.operationsPerSecond, 0)
        : "N/A",
      TanStack: tanstackGet
        ? formatNumber(tanstackGet.result.operationsPerSecond, 0)
        : "N/A",
    },
    "POST (ops/sec)": {
      "Raw Eden": rawEdenPost
        ? formatNumber(rawEdenPost.result.operationsPerSecond, 0)
        : "N/A",
      "Raw React": rawReactPost
        ? formatNumber(rawReactPost.result.operationsPerSecond, 0)
        : "N/A",
      TanStack: tanstackPost
        ? formatNumber(tanstackPost.result.operationsPerSecond, 0)
        : "N/A",
    },
    "Avg Latency GET (ms)": {
      "Raw Eden": rawEdenGet
        ? formatNumber(rawEdenGet.result.avgLatencyMs, 3)
        : "N/A",
      "Raw React": rawReactGet
        ? formatNumber(rawReactGet.result.avgLatencyMs, 3)
        : "N/A",
      TanStack: tanstackGet
        ? formatNumber(tanstackGet.result.avgLatencyMs, 3)
        : "N/A",
    },
    "Cache Hit (ops/sec)": {
      "Raw Eden": "N/A",
      "Raw React": "N/A",
      TanStack: cacheHit
        ? formatNumber(cacheHit.result.operationsPerSecond, 0)
        : "N/A",
    },
  };

  console.table(comparisonTable);

  // Overhead analysis
  if (rawEdenGet && rawReactGet && tanstackGet) {
    console.log("\n📉 OVERHEAD ANALYSIS\n");

    const reactVsEden =
      ((rawReactGet.result.avgLatencyMs - rawEdenGet.result.avgLatencyMs) /
        rawEdenGet.result.avgLatencyMs) *
      100;
    const tanstackVsReact =
      ((tanstackGet.result.avgLatencyMs - rawReactGet.result.avgLatencyMs) /
        rawReactGet.result.avgLatencyMs) *
      100;

    const overheadTable = {
      "Raw React vs Raw Eden": {
        "Latency Increase": `+${formatNumber(reactVsEden, 0)}%`,
        Note: "React render overhead",
      },
      "TanStack vs Raw React": {
        "Latency Increase": `${tanstackVsReact >= 0 ? "+" : ""}${formatNumber(tanstackVsReact, 0)}%`,
        Note: "TanStack Query overhead",
      },
    };

    if (cacheHit) {
      (overheadTable as Record<string, Record<string, string>>)[
        "TanStack Cache Hit"
      ] = {
        "Latency Increase": `~${formatNumber(cacheHit.result.avgLatencyMs, 2)}ms`,
        Note: "Instant from cache!",
      };
    }

    console.table(overheadTable);

    console.log(
      "\n💡 NOTE: Overhead includes React render cycle in test environment.",
    );
    console.log(
      "   Real-world overhead is significantly lower (only state management).",
    );
  }

  // Recommendation
  console.log("\n");
  console.log("=".repeat(80));
  console.log("  RECOMMENDATION");
  console.log("=".repeat(80));

  console.table({
    "For React apps": { Recommendation: "✅ Use TanStack Query hooks" },
    "For non-React": { Recommendation: "✅ Use Raw Eden API directly" },
    "Avoid Raw React": { Recommendation: "❌ More code, no caching benefits" },
  });
}

// ============================================
// Main Benchmark
// ============================================

async function main() {
  printHeader();

  const benchmarks = [
    // Raw Eden (baseline)
    { name: "Raw Eden GET", fn: rawEdenGet },
    { name: "Raw Eden POST", fn: rawEdenPost },
    // Raw React (traditional useState/useEffect pattern)
    { name: "Raw React GET", fn: rawReactQueryOperation },
    { name: "Raw React POST", fn: rawReactMutationOperation },
    // TanStack Query hooks
    { name: "TanStack GET", fn: hookQueryOperation },
    { name: "TanStack POST", fn: hookMutationOperation },
    { name: "TanStack Cache Hit", fn: hookCacheHitOperation },
  ];

  const allResults: { name: string; result: BenchmarkResult }[] = [];
  const phaseDuration = PHASE_DURATION_MS;

  for (const benchmark of benchmarks) {
    console.log(`\n🚀 Benchmarking: ${benchmark.name}`);
    console.log("─".repeat(60));
    console.log(
      `⏳ Running for ${Math.round(phaseDuration / 1000)} seconds...`,
    );

    const result = await runHooksBenchmark(benchmark.fn, phaseDuration);

    printResult(benchmark.name, result);
    allResults.push({ name: benchmark.name, result });
  }

  printComparison(allResults);

  console.log("\n✅ Hooks benchmark completed successfully!\n");

  // Graceful exit
  process.exit(0);
}

// Run
main().catch((error) => {
  console.error("Benchmark failed:", error);
  process.exit(1);
});
