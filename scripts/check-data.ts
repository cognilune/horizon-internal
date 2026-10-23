import { readSnapshot, getDb } from "../lib/db";
import { overview, table } from "../lib/analytics";
import { parseFilters, resources } from "../lib/filters";
import assert from "node:assert/strict";
async function run() {
  try {
    const results = await readSnapshot(async (query) => {
      const filters = parseFilters(
        new URLSearchParams({ period: "30d", pageSize: "10" }),
      );
      const summary = await overview(query, filters);
      const counts: Record<string, number> = {};
      for (const resource of resources) {
        const data = await table(query, resource, filters, { allDates: true });
        counts[resource] = data.total;
      }
      const credits = summary.series.reduce(
        (sum, row) => sum + Number(row.credits),
        0,
      );
      const gross = summary.series.reduce(
        (sum, row) => sum + Number(row.revenue),
        0,
      );
      assert.ok(
        Math.abs(credits - Number(summary.summary.credits)) < 0.0001,
        "Credit chart reconciles with overview",
      );
      assert.ok(
        Math.abs(gross - Number(summary.summary.gross)) < 0.01,
        "Revenue chart reconciles with overview",
      );
      return {
        asOf: summary.asOf,
        summary: summary.summary,
        tableCounts: counts,
        reconciliation: "passed",
      };
    });
    console.log(JSON.stringify(results, null, 2));
  } catch (error) {
    console.error("Data verification failed:", {
      code: (error as { code?: string }).code,
      message: (error as Error).message,
    });
    process.exitCode = 1;
  } finally {
    await getDb().end({ timeout: 2 });
  }
}
run();
