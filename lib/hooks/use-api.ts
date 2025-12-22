"use client";

import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryOptions,
  type UseMutationOptions,
  type QueryKey,
} from "@tanstack/react-query";
import { api } from "@/lib/eden";

// ============================================
// Type Utilities - Extract types from Eden
// ============================================

type ExtractData<T> = T extends { data: infer D } ? D : never;
type ExtractError<T> = T extends { error: infer E } ? E : never;

// Eden method types
type EdenQueryFn<TResponse> = (options?: {
  query?: Record<string, unknown>;
  headers?: Record<string, string>;
}) => Promise<TResponse>;

type EdenMutationFn<TBody, TResponse> = (
  body: TBody,
  options?: {
    query?: Record<string, unknown>;
    headers?: Record<string, string>;
  },
) => Promise<TResponse>;

// ============================================
// Core Hook Utilities
// ============================================

/**
 * useApiQuery - Universal query hook for any Eden GET endpoint
 *
 * @example
 * ```tsx
 * import { api } from "@/lib/eden";
 * import { useApiQuery } from "@/lib/hooks";
 *
 * // Auto-infers response type from Eden!
 * const { data, isLoading } = useApiQuery(["root"], api.index.get);
 *
 * // With options
 * const { data } = useApiQuery(["users"], api.users.get, {
 *   staleTime: 5000,
 *   enabled: isReady,
 * });
 * ```
 */
export function useApiQuery<
  TResponse extends { data: unknown; error: unknown },
  TData = ExtractData<TResponse>,
  TError = ExtractError<TResponse>,
>(
  queryKey: QueryKey,
  queryFn: EdenQueryFn<TResponse>,
  options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">,
  requestOptions?: Parameters<typeof queryFn>[0],
) {
  return useQuery({
    queryKey,
    queryFn: async () => {
      const res = await queryFn(requestOptions);
      if (res.error) throw res.error;
      return res.data as TData;
    },
    ...options,
  });
}

/**
 * useApiMutation - Universal mutation hook for any Eden POST/PUT/PATCH/DELETE endpoint
 *
 * @example
 * ```tsx
 * import { api } from "@/lib/eden";
 * import { useApiMutation } from "@/lib/hooks";
 *
 * // TypeScript auto-infers body type { name: string } from Elysia schema!
 * const createUser = useApiMutation(api.user.post);
 * createUser.mutate({ name: "John" }); // ✅ Type-safe
 * createUser.mutate({ wrong: "field" }); // ❌ TypeScript error
 *
 * // With callbacks
 * const createUser = useApiMutation(api.user.post, {
 *   onSuccess: (data) => toast.success("Created!"),
 *   onError: (err) => toast.error("Failed"),
 * });
 * ```
 */
export function useApiMutation<
  TBody,
  TResponse extends { data: unknown; error: unknown },
  TData = ExtractData<TResponse>,
  TError = ExtractError<TResponse>,
>(
  mutationFn: EdenMutationFn<TBody, TResponse>,
  options?: Omit<UseMutationOptions<TData, TError, TBody>, "mutationFn">,
  requestOptions?: {
    query?: Record<string, unknown>;
    headers?: Record<string, string>;
  },
) {
  return useMutation({
    mutationFn: async (body: TBody) => {
      const res = await mutationFn(body, requestOptions);
      const response = res as { data: TData; error: TError };
      if (response.error) throw response.error;
      return response.data;
    },
    ...options,
  });
}

// ============================================
// useApi Hook - The Ultimate Dynamic Hook
// ============================================

/**
 * useApi - Single hook that provides all API utilities
 * Access queries, mutations, and cache invalidation in one place
 *
 * @example
 * ```tsx
 * import { useApi } from "@/lib/hooks";
 * import { api } from "@/lib/eden";
 *
 * function MyComponent() {
 *   const { query, mutation, invalidate } = useApi();
 *
 *   // GET request - types flow from Eden automatically
 *   const { data, isLoading } = query(["root"], api.index.get);
 *
 *   // POST request - body type inferred from Elysia schema
 *   const createUser = mutation(api.user.post, {
 *     onSuccess: () => invalidate(["users"]),
 *   });
 *
 *   return (
 *     <button onClick={() => createUser.mutate({ name: "John" })}>
 *       Create
 *     </button>
 *   );
 * }
 * ```
 */
export function useApi() {
  const queryClient = useQueryClient();

  return {
    /**
     * Execute a GET query with full type inference
     */
    query: useApiQuery,

    /**
     * Execute a mutation (POST/PUT/PATCH/DELETE) with full type inference
     */
    mutation: useApiMutation,

    /**
     * Invalidate queries to trigger refetch
     */
    invalidate: (queryKey: QueryKey) =>
      queryClient.invalidateQueries({ queryKey }),

    /**
     * Set query data directly (for optimistic updates)
     */
    setData: <T>(queryKey: QueryKey, data: T) =>
      queryClient.setQueryData(queryKey, data),

    /**
     * Get cached query data
     */
    getData: <T>(queryKey: QueryKey) => queryClient.getQueryData<T>(queryKey),

    /**
     * Prefetch a query
     */
    prefetch: async <TResponse extends { data: unknown; error: unknown }>(
      queryKey: QueryKey,
      queryFn: EdenQueryFn<TResponse>,
    ) => {
      await queryClient.prefetchQuery({
        queryKey,
        queryFn: async () => {
          const res = await queryFn();
          if (res.error) throw res.error;
          return res.data;
        },
      });
    },

    /**
     * Direct access to queryClient for advanced operations
     */
    client: queryClient,
  };
}

// Export the API instance for direct access if needed
export { api };
