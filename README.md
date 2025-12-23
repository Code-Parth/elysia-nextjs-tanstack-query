# Elysia + TanStack Query Integration

> **Type-safe API hooks for blazing-fast Elysia + Next.js development**

Build end-to-end type-safe applications with Elysia and TanStack Query in Next.js. This library provides custom hooks that bridge [Elysia](https://elysiajs.com/) (via [Eden Treaty](https://elysiajs.com/eden/treaty/overview.html)) with [TanStack Query](https://tanstack.com/query), giving you the best developer experience for building modern React applications.

## Features

- **End-to-End Type Safety** - Full TypeScript inference from Elysia schema to React components
- **Zero Boilerplate** - No manual `useState`, `useEffect`, or `try/catch` needed
- **Automatic Caching** - Built-in request deduplication and caching via TanStack Query
- **Background Refetch** - Automatic data synchronization
- **Optimistic Updates** - Built-in support for instant UI updates
- **DevTools Support** - Full TanStack Query DevTools integration
- **Tiny API Surface** - Just 3 hooks: `useApiQuery`, `useApiMutation`, `useApi`

## DX Comparison

### Before (Raw React + Eden)

```tsx
function UserForm() {
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
    <form
      onSubmit={(e) => {
        e.preventDefault();
        createUser("John");
      }}>
      {loading && <p>Loading...</p>}
      {error && <p>Error: {error.message}</p>}
      {data && <p>Created: {data.name}</p>}
      <button type="submit" disabled={loading}>
        Create User
      </button>
    </form>
  );
}
```

### After (With TanStack Hooks)

```tsx
function UserForm() {
  const createUser = useApiMutation(api.user.post);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        createUser.mutate({ name: "John" });
      }}>
      {createUser.isPending && <p>Loading...</p>}
      {createUser.isError && <p>Error: {createUser.error?.message}</p>}
      {createUser.data && <p>Created: {createUser.data.name}</p>}
      <button type="submit" disabled={createUser.isPending}>
        Create User
      </button>
    </form>
  );
}
```

| Metric            | Raw React | TanStack Hooks | Improvement |
| ----------------- | --------- | -------------- | ----------- |
| Lines of Code     | 28        | 12             | **-57%**    |
| `useState` calls  | 3         | 0              | **-100%**   |
| Manual try/catch  | Yes       | No             | ✅          |
| Automatic caching | No        | Yes            | ✅          |
| DevTools support  | No        | Yes            | ✅          |

## Quick Start

### Installation

```bash
bun add elysia @elysiajs/eden @tanstack/react-query
```

### 1. Define Your Elysia API

```ts
// app/api/[[...slug]]/route.ts
import { Elysia, t } from "elysia";

export const app = new Elysia({ prefix: "/api" })
  .get("/", "Hello Nextjs")
  .post("/user", ({ body }) => body, {
    body: t.Object({
      name: t.String(),
    }),
  });

export const GET = app.fetch;
export const POST = app.fetch;
```

### 2. Create Eden Client

```ts
// lib/eden.ts
import { treaty } from "@elysiajs/eden";
import { app } from "@/app/api/[[...slug]]/route";

export const api =
  typeof process !== "undefined"
    ? treaty(app).api
    : treaty<typeof app>("localhost:3000").api;
```

### 3. Set Up TanStack Query Provider

```tsx
// provider/index.tsx
"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      gcTime: 5 * 60 * 1000,
    },
  },
});

export function Provider({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
```

```tsx
// app/layout.tsx
import { Provider } from "@/provider";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Provider>{children}</Provider>
      </body>
    </html>
  );
}
```

### 4. Use the Hooks

```tsx
"use client";

import { api } from "@/lib/eden";
import { useApiQuery, useApiMutation, useApi } from "@/lib/hooks";

function MyComponent() {
  // GET request - types flow from Eden automatically
  const { data, isLoading, error } = useApiQuery(["root"], api.index.get);

  // POST request - body type inferred from Elysia schema
  const createUser = useApiMutation(api.user.post);

  if (isLoading) return <p>Loading...</p>;
  if (error) return <p>Error: {error.message}</p>;

  return (
    <div>
      <p>{data}</p>
      <button onClick={() => createUser.mutate({ name: "John" })}>
        Create User
      </button>
    </div>
  );
}
```

## API Reference

### `useApiQuery`

Universal query hook for GET endpoints with full type inference.

```tsx
const { data, isLoading, error, isSuccess, refetch } = useApiQuery(
  queryKey,      // Unique cache key
  queryFn,       // Eden GET method (e.g., api.users.get)
  options?,      // TanStack Query options (staleTime, enabled, etc.)
  requestOptions? // Eden request options (query params, headers)
);
```

**Example:**

```tsx
// Basic usage
const { data } = useApiQuery(["users"], api.users.get);

// With options
const { data } = useApiQuery(["users"], api.users.get, {
  staleTime: 5000,
  enabled: isReady,
});

// With request options (query params, headers)
const { data } = useApiQuery(
  ["users", { page: 1 }],
  api.users.get,
  {},
  { query: { page: 1, limit: 10 } },
);
```

### `useApiMutation`

Universal mutation hook for POST/PUT/PATCH/DELETE endpoints.

```tsx
const mutation = useApiMutation(
  mutationFn,    // Eden mutation method (e.g., api.user.post)
  options?,      // TanStack Mutation options (onSuccess, onError, etc.)
  requestOptions? // Eden request options (headers)
);

// Usage
mutation.mutate(body);     // Fire and forget
await mutation.mutateAsync(body); // Await result
```

**Example:**

```tsx
// Basic usage
const createUser = useApiMutation(api.user.post);
createUser.mutate({ name: "John" }); // ✅ Type-safe
createUser.mutate({ wrong: "field" }); // ❌ TypeScript error

// With callbacks
const createUser = useApiMutation(api.user.post, {
  onSuccess: (data) => {
    toast.success(`Created user: ${data.name}`);
  },
  onError: (error) => {
    toast.error(`Failed: ${error.message}`);
  },
});
```

### `useApi`

All-in-one hook that provides queries, mutations, and cache utilities.

```tsx
const { query, mutation, invalidate, setData, getData, prefetch, client } =
  useApi();
```

**Example:**

```tsx
function MyComponent() {
  const { query, mutation, invalidate } = useApi();

  // GET request
  const { data, isLoading } = query(["root"], api.index.get);

  // POST request with cache invalidation
  const createUser = mutation(api.user.post, {
    onSuccess: () => invalidate(["users"]),
  });

  return (
    <button onClick={() => createUser.mutate({ name: "John" })}>Create</button>
  );
}
```

**Available utilities:**

| Method                     | Description                         |
| -------------------------- | ----------------------------------- |
| `query(key, fn, options?)` | Execute a GET query                 |
| `mutation(fn, options?)`   | Execute a mutation                  |
| `invalidate(key)`          | Invalidate and refetch queries      |
| `setData(key, data)`       | Set cache data (optimistic updates) |
| `getData(key)`             | Get cached data                     |
| `prefetch(key, fn)`        | Prefetch a query                    |
| `client`                   | Direct QueryClient access           |

## Advanced Usage

### Optimistic Updates

```tsx
function TodoList() {
  const { query, mutation, setData, getData } = useApi();
  const { data: todos } = query(["todos"], api.todos.get);

  const addTodo = mutation(api.todos.post, {
    onMutate: async (newTodo) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["todos"] });

      // Snapshot previous value
      const previousTodos = getData<Todo[]>(["todos"]);

      // Optimistically update
      setData(
        ["todos"],
        [...(previousTodos || []), { ...newTodo, id: "temp" }],
      );

      return { previousTodos };
    },
    onError: (err, newTodo, context) => {
      // Rollback on error
      setData(["todos"], context?.previousTodos);
    },
    onSettled: () => {
      // Refetch after mutation
      invalidate(["todos"]);
    },
  });

  return (
    <button onClick={() => addTodo.mutate({ title: "New Todo" })}>
      Add Todo
    </button>
  );
}
```

### Conditional Fetching

```tsx
const { data } = useApiQuery(
  ["user", userId],
  api.user({ id: userId }).get,
  { enabled: !!userId }, // Only fetch when userId exists
);
```

### Prefetching

```tsx
const { prefetch } = useApi();

// Prefetch on hover
<Link href="/users" onMouseEnter={() => prefetch(["users"], api.users.get)}>
  View Users
</Link>;
```

## Testing

Run the test suite:

```bash
# Run all tests
bun test

# Run unit tests only
bun test:unit

# Run integration tests only
bun test:integration

# Watch mode
bun test:watch
```

### Running Benchmarks

```bash
# Quick benchmark report (~1 min, fast results)
bun run bench:quick

# Full benchmark report (~7 min, detailed comparison)
bun run bench:report

# Individual full benchmarks (5 min each)
bun run bench          # Run both API and hooks benchmarks
bun run bench:api      # Raw Elysia/Eden API performance only
bun run bench:hooks    # TanStack Query hooks overhead only
```

| Command        | Duration | Purpose                                                         |
| -------------- | -------- | --------------------------------------------------------------- |
| `bench:quick`  | ~1 min   | Quick comparison report (10 sec per benchmark)                  |
| `bench:report` | ~7 min   | Full comparison report with DX metrics (60 sec per benchmark)   |
| `bench`        | ~10 min  | Run both API and hooks benchmarks with phase analysis           |
| `bench:api`    | ~5 min   | Raw Elysia/Eden API performance at different concurrency levels |
| `bench:hooks`  | ~5 min   | TanStack Query hooks overhead compared to raw Eden              |

## 📁 Project Structure

```
├── app/
│   ├── api/[[...slug]]/route.ts  # Elysia API routes
│   ├── layout.tsx                 # Root layout with Provider
│   └── page.tsx                   # Home page
├── lib/
│   ├── eden.ts                    # Eden Treaty client
│   └── hooks/
│       ├── index.ts               # Hook exports
│       └── use-api.ts             # Core hooks implementation
├── provider/
│   └── index.tsx                  # TanStack Query provider
├── constants/
│   └── index.ts                   # QueryClient configuration
└── __tests__/
    ├── unit/                      # Unit tests
    ├── integration/               # Integration tests
    └── benchmark/                 # Performance benchmarks
```

## Why This Approach?

| Feature               | Raw Eden | Raw React | TanStack Hooks |
| --------------------- | -------- | --------- | -------------- |
| Type Safety           | ✅ Full  | ✅ Full   | ✅ Full        |
| Automatic Caching     | ❌       | ❌        | ✅             |
| Auto Retry            | ❌       | ❌        | ✅             |
| Request Deduplication | ❌       | ❌        | ✅             |
| Background Refetch    | ❌       | ❌        | ✅             |
| Optimistic Updates    | Complex  | Complex   | Simple         |
| DevTools              | ❌       | ❌        | ✅             |
| Boilerplate           | Low      | High      | **Minimal**    |

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

---

Built with ❤️ using [Elysia](https://elysiajs.com/), [Eden Treaty](https://elysiajs.com/eden/treaty/overview.html), [TanStack Query](https://tanstack.com/query), and [Next.js](https://nextjs.org/)
