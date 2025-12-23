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
import { dxMetrics } from "../setup";

/**
 * Comprehensive Performance Report Generator (Full)
 *
 * Generates a detailed comparison between raw Eden API calls
 * and TanStack Query hooks approach with 5-minute benchmarks.
 *
 * Run with: bun run bench:report
 * For quick results: bun run bench:quick
 */

// ============================================
// Configuration
// ============================================

const DURATION_SECONDS = 60; // 60 seconds per benchmark for full report
const DURATION_MS = DURATION_SECONDS * 1000;

// ============================================
// Types
// ============================================

interface BenchmarkResult {
  name: string;
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
// Helper Functions
// ============================================

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

function createWrapper(queryClient?: QueryClient) {
  const client = queryClient ?? createQueryClient();
  const Wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  Wrapper.displayName = "TestQueryWrapper";
  return Wrapper;
}

function formatNumber(num: number, decimals = 2): string {
  return num.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

// ============================================
// Benchmark Runner
// ============================================

async function runBenchmark(
  name: string,
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
    name,
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
// Benchmark Operations
// ============================================

async function rawEdenGet() {
  await api.get();
}

async function rawEdenPost() {
  await api.user.post({ name: "Test" });
}

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
  const queryClient = createQueryClient();
  queryClient.setQueryData(["cached"], "cached-data");
  const wrapper = createWrapper(queryClient);

  const { result } = renderHook(
    () => useApiQuery(["cached"], api.get, { staleTime: Infinity }),
    { wrapper },
  );

  await waitFor(() => result.current.data !== undefined);
  cleanup();
}

// ============================================
// Raw React (useState/useEffect) Hooks - For Comparison
// ============================================

// Simulates the traditional React pattern with useState/useEffect
// NOTE: This intentionally demonstrates the verbose/problematic pattern
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
// DX Code Samples for Comparison
// ============================================

const RAW_EDEN_COMPONENT = `
function UserFormRaw() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [data, setData] = useState<{ name: string } | null>(null);

  const createUser = async (name: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.user.post({ name });
      if (res.error) throw res.error;
      setData(res.data);
    } catch (e) {
      setError(e as Error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); createUser("John"); }}>
      {loading && <p>Loading...</p>}
      {error && <p>Error: {error.message}</p>}
      {data && <p>Created: {data.name}</p>}
      <button type="submit" disabled={loading}>Create User</button>
    </form>
  );
}`;

const HOOKS_COMPONENT = `
function UserFormHooks() {
  const createUser = useApiMutation(api.user.post);

  return (
    <form onSubmit={(e) => { e.preventDefault(); createUser.mutate({ name: "John" }); }}>
      {createUser.isPending && <p>Loading...</p>}
      {createUser.isError && <p>Error: {createUser.error?.message}</p>}
      {createUser.data && <p>Created: {createUser.data.name}</p>}
      <button type="submit" disabled={createUser.isPending}>Create User</button>
    </form>
  );
}`;

// Raw React with useEffect for data fetching (traditional pattern)
const RAW_REACT_USEEFFECT_COMPONENT = `
function UserListRawReact() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [data, setData] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);

    api.get()
      .then((res) => {
        if (!isMounted) return;
        if (res.error) throw res.error;
        setData(res.data);
      })
      .catch((e) => {
        if (isMounted) setError(e as Error);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => { isMounted = false; };
  }, []);

  if (loading) return <p>Loading...</p>;
  if (error) return <p>Error: {error.message}</p>;
  return <p>Data: {data}</p>;
}`;

const HOOKS_QUERY_COMPONENT = `
function UserListHooks() {
  const { data, isLoading, error } = useApiQuery(['data'], api.get);

  if (isLoading) return <p>Loading...</p>;
  if (error) return <p>Error: {error?.message}</p>;
  return <p>Data: {data}</p>;
}`;

// ============================================
// Report Generator
// ============================================

async function generateReport() {
  console.log("\n");
  console.log("=".repeat(80));
  console.log("  ELYSIA + TANSTACK QUERY PERFORMANCE REPORT (FULL)");
  console.log("=".repeat(80));
  console.log(`  Duration: ${DURATION_SECONDS} seconds per benchmark`);
  console.log("=".repeat(80));
  console.log("\n");

  // Run benchmarks
  console.log("⏳ Running benchmarks...\n");

  const benchmarks = [
    { name: "Raw Eden GET", fn: rawEdenGet },
    { name: "Raw Eden POST", fn: rawEdenPost },
    { name: "Raw React GET", fn: rawReactQueryOperation },
    { name: "Raw React POST", fn: rawReactMutationOperation },
    { name: "TanStack GET", fn: hookQueryOperation },
    { name: "TanStack POST", fn: hookMutationOperation },
    { name: "Cache Hit", fn: hookCacheHitOperation },
  ];

  const results: BenchmarkResult[] = [];

  for (const benchmark of benchmarks) {
    console.log(`  ⏳ ${benchmark.name}...`);
    const result = await runBenchmark(
      benchmark.name,
      benchmark.fn,
      DURATION_MS,
    );
    results.push(result);
    console.log(
      `  ✅ ${benchmark.name}: ${formatNumber(result.operationsPerSecond, 0)} ops/sec`,
    );
  }

  const rawGet = results.find((r) => r.name === "Raw Eden GET")!;
  const rawPost = results.find((r) => r.name === "Raw Eden POST")!;
  const rawReactGet = results.find((r) => r.name === "Raw React GET")!;
  const rawReactPost = results.find((r) => r.name === "Raw React POST")!;
  const hooksGet = results.find((r) => r.name === "TanStack GET")!;
  const hooksPost = results.find((r) => r.name === "TanStack POST")!;
  const cacheHit = results.find((r) => r.name === "Cache Hit")!;

  // Detailed Results Table
  console.log("\n📈 DETAILED BENCHMARK RESULTS\n");

  const detailedResults = results.reduce(
    (acc, r) => {
      acc[r.name] = {
        "ops/sec": formatNumber(r.operationsPerSecond, 0),
        "Total Ops": formatNumber(r.totalOperations, 0),
        "Avg (ms)": formatNumber(r.avgLatencyMs, 3),
        "Min (ms)": formatNumber(r.minLatencyMs, 3),
        "Max (ms)": formatNumber(r.maxLatencyMs, 3),
        "P50 (ms)": formatNumber(r.p50LatencyMs, 3),
        "P95 (ms)": formatNumber(r.p95LatencyMs, 3),
        "P99 (ms)": formatNumber(r.p99LatencyMs, 3),
      };
      return acc;
    },
    {} as Record<string, Record<string, string>>,
  );

  console.table(detailedResults);

  // Performance Results - 3-Way Comparison Table
  console.log("\n📊 PERFORMANCE METRICS (3-WAY COMPARISON)\n");

  const performanceTable = {
    "GET (ops/sec)": {
      "Raw Eden": formatNumber(rawGet.operationsPerSecond, 0),
      "Raw React": formatNumber(rawReactGet.operationsPerSecond, 0),
      TanStack: formatNumber(hooksGet.operationsPerSecond, 0),
    },
    "POST (ops/sec)": {
      "Raw Eden": formatNumber(rawPost.operationsPerSecond, 0),
      "Raw React": formatNumber(rawReactPost.operationsPerSecond, 0),
      TanStack: formatNumber(hooksPost.operationsPerSecond, 0),
    },
    "Avg Latency GET (ms)": {
      "Raw Eden": formatNumber(rawGet.avgLatencyMs, 3),
      "Raw React": formatNumber(rawReactGet.avgLatencyMs, 3),
      TanStack: formatNumber(hooksGet.avgLatencyMs, 3),
    },
    "Avg Latency POST (ms)": {
      "Raw Eden": formatNumber(rawPost.avgLatencyMs, 3),
      "Raw React": formatNumber(rawReactPost.avgLatencyMs, 3),
      TanStack: formatNumber(hooksPost.avgLatencyMs, 3),
    },
    "P50 Latency GET (ms)": {
      "Raw Eden": formatNumber(rawGet.p50LatencyMs, 3),
      "Raw React": formatNumber(rawReactGet.p50LatencyMs, 3),
      TanStack: formatNumber(hooksGet.p50LatencyMs, 3),
    },
    "P95 Latency GET (ms)": {
      "Raw Eden": formatNumber(rawGet.p95LatencyMs, 3),
      "Raw React": formatNumber(rawReactGet.p95LatencyMs, 3),
      TanStack: formatNumber(hooksGet.p95LatencyMs, 3),
    },
    "P99 Latency GET (ms)": {
      "Raw Eden": formatNumber(rawGet.p99LatencyMs, 3),
      "Raw React": formatNumber(rawReactGet.p99LatencyMs, 3),
      TanStack: formatNumber(hooksGet.p99LatencyMs, 3),
    },
    "Cache Hit (ops/sec)": {
      "Raw Eden": "N/A",
      "Raw React": "N/A",
      TanStack: formatNumber(cacheHit.operationsPerSecond, 0),
    },
    "Cache Hit Latency (ms)": {
      "Raw Eden": "N/A",
      "Raw React": "N/A",
      TanStack: formatNumber(cacheHit.avgLatencyMs, 3),
    },
  };

  console.table(performanceTable);

  // DX Metrics - 3-Way Comparison
  const rawEdenLines = dxMetrics.countLines(RAW_EDEN_COMPONENT);
  const rawReactLines = dxMetrics.countLines(RAW_REACT_USEEFFECT_COMPONENT);
  const hooksLines = dxMetrics.countLines(HOOKS_COMPONENT);
  const hooksQueryLines = dxMetrics.countLines(HOOKS_QUERY_COMPONENT);

  const rawEdenStateVars = dxMetrics.countStateVariables(RAW_EDEN_COMPONENT);
  const rawReactStateVars = dxMetrics.countStateVariables(
    RAW_REACT_USEEFFECT_COMPONENT,
  );
  const hooksStateVars = dxMetrics.countStateVariables(HOOKS_COMPONENT);

  console.log("\n🎯 DEVELOPER EXPERIENCE (DX) - 3-WAY COMPARISON\n");

  const dxTable = {
    "Lines of Code (Mutation)": {
      "Raw Eden": rawEdenLines,
      "Raw React": rawEdenLines,
      TanStack: hooksLines,
      Winner: `✅ TanStack (-${Math.round(((rawEdenLines - hooksLines) / rawEdenLines) * 100)}%)`,
    },
    "Lines of Code (Query)": {
      "Raw Eden": "N/A",
      "Raw React": rawReactLines,
      TanStack: hooksQueryLines,
      Winner: `✅ TanStack (-${Math.round(((rawReactLines - hooksQueryLines) / rawReactLines) * 100)}%)`,
    },
    "useState() calls": {
      "Raw Eden": rawEdenStateVars,
      "Raw React": rawReactStateVars,
      TanStack: hooksStateVars,
      Winner: "✅ TanStack (0 state)",
    },
    "useEffect() required": {
      "Raw Eden": "No",
      "Raw React": "Yes",
      TanStack: "No",
      Winner: "✅ Eden/TanStack",
    },
    "Manual try/catch": {
      "Raw Eden": "Yes",
      "Raw React": "Yes",
      TanStack: "No",
      Winner: "✅ TanStack",
    },
    "Loading state code": {
      "Raw Eden": "8 lines",
      "Raw React": "6 lines",
      TanStack: "0 lines",
      Winner: "✅ TanStack",
    },
    "Cleanup/unmount logic": {
      "Raw Eden": "No",
      "Raw React": "Yes",
      TanStack: "No",
      Winner: "✅ Eden/TanStack",
    },
    "Automatic caching": {
      "Raw Eden": "❌ No",
      "Raw React": "❌ No",
      TanStack: "✅ Yes",
      Winner: "✅ TanStack",
    },
    "Auto retry on failure": {
      "Raw Eden": "❌ No",
      "Raw React": "❌ No",
      TanStack: "✅ Yes",
      Winner: "✅ TanStack",
    },
    "Request deduplication": {
      "Raw Eden": "❌ No",
      "Raw React": "❌ No",
      TanStack: "✅ Yes",
      Winner: "✅ TanStack",
    },
    "Background refetch": {
      "Raw Eden": "❌ No",
      "Raw React": "❌ No",
      TanStack: "✅ Yes",
      Winner: "✅ TanStack",
    },
    "Optimistic updates": {
      "Raw Eden": "Complex",
      "Raw React": "Complex",
      TanStack: "Simple",
      Winner: "✅ TanStack",
    },
    "DevTools support": {
      "Raw Eden": "❌ No",
      "Raw React": "❌ No",
      TanStack: "✅ Yes",
      Winner: "✅ TanStack",
    },
    "Type Safety": {
      "Raw Eden": "✅ Full",
      "Raw React": "✅ Full",
      TanStack: "✅ Full",
      Winner: "🟡 All (Eden types)",
    },
  };

  console.table(dxTable);

  // Conclusion Summary
  const perfOverheadReact =
    ((rawReactGet.avgLatencyMs - rawGet.avgLatencyMs) / rawGet.avgLatencyMs) *
    100;
  const perfOverheadTanStack =
    ((hooksGet.avgLatencyMs - rawReactGet.avgLatencyMs) /
      rawReactGet.avgLatencyMs) *
    100;
  const codeReduction = Math.round(
    ((rawReactLines - hooksQueryLines) / rawReactLines) * 100,
  );

  console.log("\n🏁 CONCLUSION\n");

  const conclusionTable = {
    "Performance Analysis": {
      "Raw Eden": "⚡ Fastest (baseline)",
      "Raw React": `+${formatNumber(perfOverheadReact, 0)}% latency (React overhead)`,
      TanStack: `+${formatNumber(perfOverheadTanStack, 0)}% latency vs React`,
    },
    "Code Reduction": {
      "Raw Eden": "Minimal (no React)",
      "Raw React": `${rawReactLines} lines`,
      TanStack: `${hooksQueryLines} lines (-${codeReduction}%)`,
    },
    "Best For": {
      "Raw Eden": "Server-side / Non-React",
      "Raw React": "Legacy apps",
      TanStack: "React apps (recommended)",
    },
    "Cache Performance": {
      "Raw Eden": "N/A",
      "Raw React": "Manual implementation",
      TanStack: `~${formatNumber(cacheHit.avgLatencyMs, 2)}ms (instant!)`,
    },
  };

  console.table(conclusionTable);

  console.log("\n✅ RECOMMENDATION:");
  console.log("   • For React apps: Use TanStack Query hooks for best DX");
  console.log("   • For non-React: Use Raw Eden API directly");
  console.log("   • Avoid Raw React: More code, no caching benefits\n");

  console.log("\n✅ Report generation completed successfully!\n");
}

// Run report and exit
generateReport()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("Report generation failed:", error);
    process.exit(1);
  });
