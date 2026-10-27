import { requireAdmin, audit, sameOrigin } from "@/lib/auth";
import { getDb, readSnapshot, json, apiError, PublicError } from "@/lib/db";
import { overview, table, detail, search } from "@/lib/analytics";
import { parseFilters, resources, type Resource, toCsv } from "@/lib/filters";
import { catalog, limitations } from "@/lib/catalog";
import { randomUUID } from "node:crypto";
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

export async function PATCH(request: Request) {
  try {
    sameOrigin(request);
    const admin = await requireAdmin();
    if (Number(request.headers.get("content-length") || 0) > 2048)
      throw new PublicError("Invalid status request.", 422);
    const body = await request.json();
    if (body?.resource === "workspace") {
      if (
        typeof body.workspaceId !== "string" ||
        !body.workspaceId ||
        body.workspaceId.length > 200 ||
        !["activate", "deactivate"].includes(body.action)
      )
        throw new PublicError("Choose a valid workspace and action.", 422);

      const activating = body.action === "activate";
      const db = getDb(false);
      const workspace = await db.begin(async (tx) => {
        const [current] = await tx<
          { id: string; name: string; status: string }[]
        >`SELECT id,name,status FROM customer_workspaces WHERE id=${body.workspaceId} FOR UPDATE`;
        if (!current)
          throw new PublicError("Workspace not found.", 404);
        const status = activating ? "active" : "suspended";
        const storedStatus = activating ? "active" : "deleted";
        if (current.status === storedStatus)
          return { id: current.id, name: current.name, status };
        if (activating && !["deleted", "suspended"].includes(current.status))
          throw new PublicError("Only an inactive workspace can be activated.", 409);
        if (!activating && current.status !== "active")
          throw new PublicError("Only an active workspace can be deactivated.", 409);

        await tx`UPDATE customer_workspaces SET status=${storedStatus},updated_at=NOW() WHERE id=${current.id}`;
        await tx`INSERT INTO audit_logs(id,actor_id,action,entity_type,entity_id,after_data)
          VALUES(${randomUUID()},${admin.userId},${`admin.workspace_${body.action}`},'horizon_internal','analytics',${tx.json({ workspaceId: current.id, status })})`;
        return { id: current.id, name: current.name, status };
      });
      return json({ ok: true, workspace });
    }
    if (body?.resource === "project") {
      if (
        typeof body.projectId !== "string" ||
        !body.projectId ||
        body.projectId.length > 200 ||
        !["delete", "restore", "block", "unblock"].includes(body.action)
      )
        throw new PublicError("Choose a valid project and action.", 422);

      const deleting = body.action === "delete";
      const changingDeletion = deleting || body.action === "restore";
      const blocking = body.action === "block";
      const db = getDb(false);
      const project = await db.begin(async (tx) => {
        const [current] = await tx<
          { id: string; name: string; conversation_id: string | null; deleted_at: Date | null; website_blocked: boolean }[]
        >`SELECT id,name,conversation_id,deleted_at,COALESCE((memory->>'adminBlocked')::boolean,false) website_blocked FROM ai_projects WHERE id=${body.projectId} FOR UPDATE`;
        if (!current) throw new PublicError("Project not found.", 404);
        if (changingDeletion && Boolean(current.deleted_at) === deleting)
          return { id: current.id, name: current.name, status: deleting ? "deleted" : "draft", blocked: current.website_blocked };
        if (!changingDeletion && current.website_blocked === blocking)
          return { id: current.id, name: current.name, status: current.deleted_at ? "deleted" : "draft", blocked: blocking };

        if (changingDeletion) {
          await tx`UPDATE ai_projects SET deleted_at=${deleting ? new Date() : null},updated_at=NOW() WHERE id=${current.id}`;
          if (current.conversation_id)
            await tx`UPDATE customer_chat_conversations SET deleted_at=${deleting ? new Date() : null},updated_at=NOW() WHERE id=${current.conversation_id}`;
        } else
          await tx`UPDATE ai_projects SET memory=COALESCE(memory,'{}'::jsonb)||${tx.json({ adminBlocked: blocking, adminBlockedAt: blocking ? new Date().toISOString() : null })},updated_at=NOW() WHERE id=${current.id}`;
        const status = changingDeletion ? (deleting ? "deleted" : "draft") : current.deleted_at ? "deleted" : "draft";
        await tx`INSERT INTO audit_logs(id,actor_id,action,entity_type,entity_id,after_data)
          VALUES(${randomUUID()},${admin.userId},${`admin.project_${body.action}`},'horizon_internal','analytics',${tx.json({ projectId: current.id, status, blocked: changingDeletion ? current.website_blocked : blocking })})`;
        return { id: current.id, name: current.name, status, blocked: changingDeletion ? current.website_blocked : blocking };
      });
      return json({ ok: true, project });
    }
    if (
      !body ||
      typeof body.userId !== "string" ||
      !body.userId ||
      body.userId.length > 200 ||
      !["block", "unblock"].includes(body.action)
    )
      throw new PublicError("Choose a valid user and action.", 422);

    const blocked = body.action === "block";
    const db = getDb(false);
    const result = await db.begin(async (tx) => {
      const [user] = await tx<
        { id: string; role: string; status: string; name: string }[]
      >`SELECT id,role,status,name FROM users WHERE id=${body.userId} FOR UPDATE`;
      if (!user || user.role !== "customer")
        throw new PublicError("Customer account not found.", 404);

      // The shared Horizon schema stores blocked customer accounts as
      // "suspended"; reporting normalizes that value to "blocked" for admins.
      const storedStatus = blocked ? "suspended" : "active";
      if (user.status !== storedStatus)
        await tx`UPDATE users SET status=${storedStatus},updated_at=NOW() WHERE id=${user.id}`;
      if (blocked) {
        await tx`UPDATE customer_account_sessions SET revoked_at=COALESCE(revoked_at,NOW()) WHERE user_id=${user.id} AND revoked_at IS NULL`;
        await tx`INSERT INTO customer_account_settings(user_id,sessions_revoked_before)
          VALUES(${user.id},NOW()) ON CONFLICT(user_id) DO UPDATE SET
          sessions_revoked_before=NOW(),updated_at=NOW()`;
      }
      const status = blocked ? "blocked" : "active";
      await tx`INSERT INTO audit_logs(id,actor_id,action,entity_type,entity_id,after_data)
        VALUES(${randomUUID()},${admin.userId},${`admin.user_${body.action}`},'horizon_internal','analytics',${tx.json({ userId: user.id, status })})`;
      return { id: user.id, name: user.name, status };
    });
    return json({ ok: true, user: result });
  } catch (error) {
    return apiError(error);
  }
}
