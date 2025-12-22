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
