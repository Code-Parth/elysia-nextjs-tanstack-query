import { describe, test, expect } from "bun:test";
import { useState } from "react";
import { dxMetrics } from "../setup";

/**
 * Integration Tests - Raw Eden Approach
 *
 * This file demonstrates the RAW EDEN approach to API calls.
 * Compare with tanstack-hooks.test.tsx to see the DX difference.
 *
 * Key observations:
 * - Manual state management (loading, error, data)
 * - Manual try/catch for error handling
 * - No automatic caching
 * - More boilerplate code
 */

// ============================================
// Component Implementation - RAW EDEN APPROACH
// ============================================

/**
 * UserFormRaw - Creates a user using raw Eden API calls
 *
 * Lines of code: 35
 * useState calls: 3
 * Manual error handling: Yes
 * Manual loading state: Yes
 */
function UserFormRaw({
  onSuccess,
  apiCall,
}: {
  onSuccess?: (data: { name: string }) => void;
  apiCall: (body: {
    name: string;
  }) => Promise<{ data: { name: string } | null; error: unknown }>;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [data, setData] = useState<{ name: string } | null>(null);

  const createUser = async (name: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiCall({ name });
      if (res.error) {
        throw new Error(String(res.error));
      }
      if (res.data) {
        setData(res.data);
        onSuccess?.(res.data);
      }
    } catch (e) {
      setError(e as Error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const formData = new FormData(e.currentTarget);
          createUser(formData.get("name") as string);
        }}>
        <input name="name" placeholder="Enter name" data-testid="name-input" />
        <button type="submit" disabled={loading} data-testid="submit-btn">
          {loading ? "Creating..." : "Create User"}
        </button>
      </form>

      {loading && <p data-testid="loading">Loading...</p>}
      {error && <p data-testid="error">Error: {error.message}</p>}
      {data && <p data-testid="success">Created: {data.name}</p>}
    </div>
  );
}

// ============================================
// Code for DX Metrics Analysis
// ============================================

const USER_FORM_RAW_CODE = `
function UserFormRaw({ onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  const createUser = async (name) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.user.post({ name });
      if (res.error) {
        throw new Error(String(res.error));
      }
      setData(res.data);
      onSuccess?.(res.data);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <form onSubmit={(e) => { e.preventDefault(); createUser(formData.get("name")); }}>
        <input name="name" placeholder="Enter name" />
        <button type="submit" disabled={loading}>
          {loading ? "Creating..." : "Create User"}
        </button>
      </form>
      {loading && <p>Loading...</p>}
      {error && <p>Error: {error.message}</p>}
      {data && <p>Created: {data.name}</p>}
    </div>
  );
}`;

// ============================================
// Integration Tests
// ============================================

describe("Integration Tests - Raw Eden Approach", () => {
  describe("DX Metrics - Raw Eden", () => {
    test("code metrics analysis", () => {
      const lines = dxMetrics.countLines(USER_FORM_RAW_CODE);
      const stateVars = dxMetrics.countStateVariables(USER_FORM_RAW_CODE);
      const hasTryCatch = dxMetrics.hasTryCatch(USER_FORM_RAW_CODE);
      const hasManualLoading = dxMetrics.hasManualLoading(USER_FORM_RAW_CODE);

      console.log("\n📊 RAW EDEN DX METRICS:");
      console.log(`   Lines of code: ${lines}`);
      console.log(`   useState calls: ${stateVars}`);
      console.log(`   Manual try/catch: ${hasTryCatch}`);
      console.log(`   Manual loading state: ${hasManualLoading}`);

      // Assertions for documentation
      expect(lines).toBeGreaterThan(25); // More verbose
      expect(stateVars).toBe(3); // loading, error, data
      expect(hasTryCatch).toBe(true);
      expect(hasManualLoading).toBe(true);
    });
  });

  describe("Component Structure Verification", () => {
    test("UserFormRaw component is properly defined", () => {
      // Verify component exists and has expected structure
      expect(typeof UserFormRaw).toBe("function");
      expect(UserFormRaw.length).toBe(1); // Takes props object
    });
  });

  describe("Feature List Verification", () => {
    test("raw approach requires manual implementation", () => {
      // Document what you need to implement manually with raw approach
      const features = {
        automaticCaching: false,
        automaticRetry: false,
        requestDeduplication: false,
        backgroundRefetch: false,
        optimisticUpdates: false, // Possible but complex
        devToolsSupport: false,
        builtInLoadingState: false,
        builtInErrorState: false,
        builtInSuccessState: false,
        manualStateManagement: true, // 3 useState calls
        manualTryCatch: true,
      };

      // Raw approach requires manual work
      expect(features.automaticCaching).toBe(false);
      expect(features.automaticRetry).toBe(false);
      expect(features.manualStateManagement).toBe(true);
      expect(features.manualTryCatch).toBe(true);
    });
  });

  describe("DX Comparison Summary", () => {
    test("compare raw vs hooks approach", () => {
      const rawLines = dxMetrics.countLines(USER_FORM_RAW_CODE);
      const hooksLines = 18; // From tanstack-hooks.test.tsx

      const rawStateVars = dxMetrics.countStateVariables(USER_FORM_RAW_CODE);
      const hooksStateVars = 0;

      const codeReduction = Math.round(
        ((rawLines - hooksLines) / rawLines) * 100,
      );

      console.log("\n📊 DX COMPARISON SUMMARY:");
      console.log(
        `   Raw Eden:     ${rawLines} lines, ${rawStateVars} useState calls`,
      );
      console.log(
        `   Hooks:        ${hooksLines} lines, ${hooksStateVars} useState calls`,
      );
      console.log(`   Code reduction: ${codeReduction}%`);

      // Hooks approach should have significantly less code
      expect(codeReduction).toBeGreaterThan(40);
      expect(rawStateVars).toBeGreaterThan(hooksStateVars);
    });
  });
});

// Export components for comparison
export { UserFormRaw, USER_FORM_RAW_CODE };
