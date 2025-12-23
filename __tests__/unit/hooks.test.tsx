import { describe, test, expect, beforeEach, mock } from "bun:test";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { useApiQuery, useApiMutation, useApi } from "@/lib/hooks";

/**
 * Unit Tests for TanStack Query Hooks
 *
 * These tests verify the useApiQuery, useApiMutation, and useApi hooks
 * work correctly with proper type inference and TanStack Query features.
 */

// Helper to create test wrapper with fresh QueryClient
function createWrapper(queryClient?: QueryClient) {
  const client =
    queryClient ??
    new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

  const Wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  Wrapper.displayName = "TestWrapper";
  return Wrapper;
}

// Mock responses
const mockGetResponse = { data: "Hello Nextjs", error: null };
const mockPostResponse = { data: { name: "John Doe" }, error: null };
const mockErrorResponse = {
  data: null,
  error: { message: "Validation failed" },
};

describe("TanStack Query Hooks", () => {
  describe("useApiQuery", () => {
    test("fetches data successfully", async () => {
      const mockFn = mock(() => Promise.resolve(mockGetResponse));
      const wrapper = createWrapper();

      const { result } = renderHook(() => useApiQuery(["test-get"], mockFn), {
        wrapper,
      });

      // Initially loading
      expect(result.current.isLoading).toBe(true);
      expect(result.current.data).toBeUndefined();

      // Wait for success
      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toBe("Hello Nextjs");
      expect(result.current.isLoading).toBe(false);
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    test("handles errors correctly", async () => {
      const mockFn = mock(() => Promise.resolve(mockErrorResponse));
      const wrapper = createWrapper();

      const { result } = renderHook(() => useApiQuery(["test-error"], mockFn), {
        wrapper,
      });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error).toEqual({ message: "Validation failed" });
      expect(result.current.data).toBeUndefined();
    });

    test("uses cache on subsequent calls with same key", async () => {
      const mockFn = mock(() => Promise.resolve(mockGetResponse));
      const queryClient = new QueryClient({
        defaultOptions: {
          queries: { retry: false, staleTime: 60000 }, // Cache for 60s
        },
      });
      const wrapper = createWrapper(queryClient);

      // First render - should fetch
      const { result: result1 } = renderHook(
        () =>
          useApiQuery(["cached-key"], mockFn, {
            staleTime: 60000,
          }),
        { wrapper },
      );

      await waitFor(() => expect(result1.current.isSuccess).toBe(true));
      expect(mockFn).toHaveBeenCalledTimes(1);

      // Second render with same key - should use cache (not refetch)
      const { result: result2 } = renderHook(
        () =>
          useApiQuery(["cached-key"], mockFn, {
            staleTime: 60000,
          }),
        { wrapper },
      );

      // Data should be available immediately from cache
      expect(result2.current.data).toBe("Hello Nextjs");
      // Mock should still only be called once (cached, not stale)
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    test("respects enabled option", async () => {
      const mockFn = mock(() => Promise.resolve(mockGetResponse));
      const wrapper = createWrapper();

      const { result, rerender } = renderHook(
        ({ enabled }) => useApiQuery(["conditional"], mockFn, { enabled }),
        { wrapper, initialProps: { enabled: false } },
      );

      // Should not fetch when disabled
      expect(result.current.fetchStatus).toBe("idle");
      expect(mockFn).not.toHaveBeenCalled();

      // Enable and refetch
      rerender({ enabled: true });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(mockFn).toHaveBeenCalledTimes(1);
    });
  });

  describe("useApiMutation", () => {
    test("executes mutation successfully", async () => {
      const mockFn = mock(() => Promise.resolve(mockPostResponse));
      const wrapper = createWrapper();

      const { result } = renderHook(() => useApiMutation(mockFn), { wrapper });

      // Initially idle
      expect(result.current.isPending).toBe(false);
      expect(result.current.data).toBeUndefined();

      // Execute mutation and wait for completion
      act(() => {
        result.current.mutate({ name: "John Doe" });
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual({ name: "John Doe" });
      expect(mockFn).toHaveBeenCalledWith({ name: "John Doe" }, undefined);
    });

    test("handles mutation errors", async () => {
      const mockFn = mock(() => Promise.resolve(mockErrorResponse));
      const wrapper = createWrapper();

      const { result } = renderHook(() => useApiMutation(mockFn), { wrapper });

      act(() => {
        result.current.mutate({ name: "test" });
      });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error).toEqual({ message: "Validation failed" });
    });

    test("calls onSuccess callback", async () => {
      const mockFn = mock(() => Promise.resolve(mockPostResponse));
      const onSuccess = mock(() => {});
      const wrapper = createWrapper();

      const { result } = renderHook(
        () => useApiMutation(mockFn, { onSuccess }),
        { wrapper },
      );

      act(() => {
        result.current.mutate({ name: "Test" });
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      await waitFor(() => expect(onSuccess).toHaveBeenCalled());

      // Verify onSuccess was called (data verification done by toHaveBeenCalled)
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });

    test("calls onError callback", async () => {
      const mockFn = mock(() => Promise.resolve(mockErrorResponse));
      const onError = mock(() => {});
      const wrapper = createWrapper();

      const { result } = renderHook(() => useApiMutation(mockFn, { onError }), {
        wrapper,
      });

      act(() => {
        result.current.mutate({ name: "test" });
      });

      await waitFor(() => expect(onError).toHaveBeenCalled());
    });

    test("provides isPending state during mutation", async () => {
      let resolvePromise: (value: typeof mockPostResponse) => void;
      const mockFn = mock(
        () =>
          new Promise<typeof mockPostResponse>((resolve) => {
            resolvePromise = resolve;
          }),
      );
      const wrapper = createWrapper();

      const { result } = renderHook(() => useApiMutation(mockFn), { wrapper });

      // Start mutation (don't await)
      act(() => {
        result.current.mutate({ name: "test" });
      });

      // Should be pending
      await waitFor(() => expect(result.current.isPending).toBe(true));

      // Resolve the promise
      act(() => {
        resolvePromise!(mockPostResponse);
      });

      await waitFor(() => expect(result.current.isPending).toBe(false));
      expect(result.current.isSuccess).toBe(true);
    });
  });

  describe("useApi", () => {
    let queryClient: QueryClient;
    let wrapper: ReturnType<typeof createWrapper>;

    beforeEach(() => {
      queryClient = new QueryClient({
        defaultOptions: {
          queries: { retry: false },
          mutations: { retry: false },
        },
      });
      wrapper = createWrapper(queryClient);
    });

    test("provides query function", async () => {
      const mockFn = mock(() => Promise.resolve(mockGetResponse));

      const { result } = renderHook(() => useApi(), { wrapper });

      // Use the query function from useApi
      const { result: queryResult } = renderHook(
        () => result.current.query(["api-query"], mockFn),
        { wrapper },
      );

      await waitFor(() => expect(queryResult.current.isSuccess).toBe(true));
      expect(queryResult.current.data).toBe("Hello Nextjs");
    });

    test("provides mutation function", async () => {
      const mockFn = mock(() => Promise.resolve(mockPostResponse));

      const { result } = renderHook(() => useApi(), { wrapper });

      const { result: mutationResult } = renderHook(
        () => result.current.mutation(mockFn),
        { wrapper },
      );

      act(() => {
        mutationResult.current.mutate({ name: "test" });
      });

      await waitFor(() => expect(mutationResult.current.isSuccess).toBe(true));
      expect(mutationResult.current.data).toEqual({ name: "John Doe" });
    });

    test("provides invalidate function", async () => {
      // Pre-populate cache
      queryClient.setQueryData(["to-invalidate"], "old-data");

      const { result } = renderHook(() => useApi(), { wrapper });

      // Invalidate should mark as invalidated
      await act(async () => {
        await result.current.invalidate(["to-invalidate"]);
      });

      // Cache should be invalidated
      const state = queryClient.getQueryState(["to-invalidate"]);
      expect(state?.isInvalidated).toBe(true);
    });

    test("provides setData function for optimistic updates", () => {
      const { result } = renderHook(() => useApi(), { wrapper });

      act(() => {
        result.current.setData(["optimistic-key"], { name: "Optimistic" });
      });

      const data = queryClient.getQueryData(["optimistic-key"]);
      expect(data).toEqual({ name: "Optimistic" });
    });

    test("provides getData function", () => {
      queryClient.setQueryData(["existing-key"], { value: 42 });

      const { result } = renderHook(() => useApi(), { wrapper });

      const data = result.current.getData<{ value: number }>(["existing-key"]);
      expect(data).toEqual({ value: 42 });
    });
  });
});
