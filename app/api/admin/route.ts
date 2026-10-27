import { requireAdmin, audit } from "@/lib/auth";
import { readSnapshot, json, apiError, PublicError } from "@/lib/db";
import { overview, table, detail, search } from "@/lib/analytics";
import { parseFilters, resources, type Resource, toCsv } from "@/lib/filters";
import { catalog, limitations } from "@/lib/catalog";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const admin = await requireAdmin();
    const p = new URL(request.url).searchParams,
      view = p.get("view") || "overview";
    const f = parseFilters(p);
    if (view === "search")
      return json({
        rows: await readSnapshot((q) => search(q, p.get("q") || "")),
      });
    if (view === "settings")
      return json({
        admin: { name: admin.name, email: admin.email, role: admin.role },
        catalog,
        limitations,
        configuration: {
          databaseConfigured: Boolean(process.env.DATABASE_URL),
          dedicatedReadOnlyCredential: Boolean(
            process.env.ANALYTICS_DATABASE_URL,
          ),
          reportingTimezone: "UTC",
          sessionHours: 8,
          access: "Administrators only",
          mode: "Read-only analytics",
          schema: "Existing Horizon PostgreSQL",
          pricingSource: "Horizon configuration · 22 Oct 2026",
        },
      });
    if (view === "overview")
      return json(await readSnapshot((q) => overview(q, f)));
    const resource = p.get("resource") as Resource;
    if (!resources.includes(resource))
      throw new PublicError("Unknown report.", 404);
    if (view === "detail") {
      const id = p.get("id");
      if (!id || id.length > 200)
        throw new PublicError("A valid record ID is required.");
      await audit(admin.userId, "admin.record_view", { resource, id });
      return json(await readSnapshot((q) => detail(q, resource, id, f)));
    }
    if (view !== "table" && view !== "export")
      throw new PublicError("Unknown report view.", 404);
    const result = await readSnapshot((q) =>
      table(q, resource, f, {
        export: view === "export",
        allDates: p.get("allDates") === "true",
      }),
    );
    if (view === "export") {
      await audit(admin.userId, "admin.csv_export", {
        resource,
        rows: result.total,
        start: f.start,
        end: f.end,
      });
      const csv = toCsv(result.rows, Object.keys(result.rows[0] || { id: "" }));
      return new Response(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="horizon-${resource}-${f.start.slice(0, 10)}.csv"`,
          "Cache-Control": "no-store, private",
          Vary: "Cookie",
        },
      });
    }
    return json({ ...result, asOf: f.asOf });
  } catch (error) {
    return apiError(error);
  }
}
