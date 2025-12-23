import { describe, test, expect } from "bun:test";
import { app } from "@/app/api/[[...slug]]/route";

/**
 * Unit Tests for Raw Elysia API Endpoints
 *
 * These tests verify the Elysia API works correctly without any wrapper.
 * This establishes a baseline for comparison with TanStack Query hooks.
 */

describe("Elysia API - Raw Endpoints", () => {
  describe("GET /api", () => {
    test("returns 'Hello Nextjs' string", async () => {
      const response = await app.handle(new Request("http://localhost/api"));

      expect(response.status).toBe(200);
      const text = await response.text();
      expect(text).toBe("Hello Nextjs");
    });

    test("returns 200 status code", async () => {
      const response = await app.handle(new Request("http://localhost/api"));

      expect(response.status).toBe(200);
    });
  });

  describe("POST /api/user", () => {
    test("creates user and returns body", async () => {
      const response = await app.handle(
        new Request("http://localhost/api/user", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "John Doe" }),
        }),
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({ name: "John Doe" });
    });

    test("validates required name field", async () => {
      const response = await app.handle(
        new Request("http://localhost/api/user", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }),
      );

      // Elysia returns 422 for validation errors
      expect(response.status).toBe(422);
    });

    test("validates name must be string", async () => {
      const response = await app.handle(
        new Request("http://localhost/api/user", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: 123 }),
        }),
      );

      expect(response.status).toBe(422);
    });
  });

  describe("Error Handling", () => {
    test("returns 404 for unknown routes", async () => {
      const response = await app.handle(
        new Request("http://localhost/api/unknown"),
      );

      expect(response.status).toBe(404);
    });
  });
});
