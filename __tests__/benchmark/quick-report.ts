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
 * Quick Performance Report Generator
 *
 * Generates a fast comparison between raw Eden API calls
 * and TanStack Query hooks approach with shorter benchmarks.
 *
 * Run with: bun run bench:quick
 * For full report: bun run bench:report
 */

// ============================================
// Configuration
// ============================================

const DURATION_SECONDS = 10; // 10 seconds per benchmark for quick results
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
  console.log("  ELYSIA + TANSTACK QUERY QUICK PERFORMANCE REPORT");
  console.log("=".repeat(80));
  console.log(
    `  Duration: ${DURATION_SECONDS} seconds per benchmark (quick mode)`,
  );
  console.log("=".repeat(80));
  console.log("\n");

  // Run benchmarks
  console.log("⏳ Running quick benchmarks...\n");

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

  // Quick Results Table
  console.log("\n📊 QUICK BENCHMARK RESULTS\n");

  const quickResults = results.reduce(
    (acc, r) => {
      acc[r.name] = {
        "ops/sec": formatNumber(r.operationsPerSecond, 0),
        "Avg (ms)": formatNumber(r.avgLatencyMs, 3),
        "P95 (ms)": formatNumber(r.p95LatencyMs, 3),
      };
      return acc;
    },
    {} as Record<string, Record<string, string>>,
  );

  console.table(quickResults);

  // Performance Comparison
  console.log("\n📈 PERFORMANCE COMPARISON\n");

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
    "Cache Hit (ops/sec)": {
      "Raw Eden": "N/A",
      "Raw React": "N/A",
      TanStack: formatNumber(cacheHit.operationsPerSecond, 0),
    },
  };

  console.table(performanceTable);

  // DX Metrics - Quick Summary
  const rawEdenLines = dxMetrics.countLines(RAW_EDEN_COMPONENT);
  const rawReactLines = dxMetrics.countLines(RAW_REACT_USEEFFECT_COMPONENT);
  const hooksQueryLines = dxMetrics.countLines(HOOKS_QUERY_COMPONENT);

  const rawEdenStateVars = dxMetrics.countStateVariables(RAW_EDEN_COMPONENT);
  const hooksStateVars = dxMetrics.countStateVariables(HOOKS_COMPONENT);

  console.log("\n🎯 DX QUICK SUMMARY\n");

  const dxTable = {
    "Lines of Code": {
      "Raw Eden": rawEdenLines,
      "Raw React": rawReactLines,
      TanStack: hooksQueryLines,
      Savings: `-${Math.round(((rawReactLines - hooksQueryLines) / rawReactLines) * 100)}%`,
    },
    "useState() calls": {
      "Raw Eden": rawEdenStateVars,
      "Raw React": 3,
      TanStack: hooksStateVars,
      Savings: "-100%",
    },
  };

  console.table(dxTable);

  // Quick Conclusion
  const codeReduction = Math.round(
    ((rawReactLines - hooksQueryLines) / rawReactLines) * 100,
  );

  console.log("\n🏁 QUICK SUMMARY\n");

  console.table({
    "Code Reduction": { Value: `${codeReduction}% fewer lines` },
    "Cache Hits": { Value: `~${formatNumber(cacheHit.avgLatencyMs, 2)}ms` },
    "useState() calls": { Value: "Zero with TanStack hooks" },
  });

  console.log("\n💡 Run 'bun run bench:report' for detailed analysis\n");
  console.log("✅ Quick report completed!\n");
}

// Run report and exit
generateReport()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("Quick report failed:", error);
    process.exit(1);
  });
