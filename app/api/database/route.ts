import { requireAdmin, sameOrigin } from "@/lib/auth";
import { apiError, getDb, json, PublicError } from "@/lib/db";

const DATABASE_PAGE_SIZE = 25;

function date(value: string | null) {
  if (!value) return null;
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(Date.parse(value)) ||
    new Date(value).toISOString().slice(0, 10) !== value
  )
    throw new PublicError("Choose a valid date.", 422);
  return value;
}

export async function GET(request: Request) {
  try {
    const session = await requireAdmin();
    const p = new URL(request.url).searchParams;
    const search = (p.get("q") || "").trim().slice(0, 254);
    const workspace = (p.get("workspace") || "").trim().slice(0, 254);
    const email = (p.get("email") || "").trim().slice(0, 254);
    const type = p.get("type") || "",
      status = p.get("status") || "";
    const from = date(p.get("from")),
      until = date(p.get("until"));
    if (from && until && from > until)
      throw new PublicError("The end date precedes the start date.", 422);
    const page = Number(p.get("page") || 1);
    if (!Number.isSafeInteger(page) || page < 1 || page > 1000000)
      throw new PublicError("Invalid page.", 422);
    const sort = p.get("sort") === "activity" ? "activity" : "created";
    const direction = p.get("direction") === "asc" ? "ASC" : "DESC";
    const db = getDb(false);
    return json(
      await db.begin(
        "isolation level repeatable read read only",
        async (tx) => {
          const [admin] =
            await tx`SELECT id FROM users WHERE id=${session.userId} AND role='admin' AND status='active'`;
          if (!admin)
            throw new PublicError("Administrator access required.", 403);
          if (p.get("view") === "summary") {
            const [counts] = await tx`SELECT count(distinct user_id)::int total,
              count(distinct user_id) FILTER (WHERE type='managed')::int managed,
              count(distinct user_id) FILTER (WHERE type='external')::int external,
              count(distinct user_id) FILTER (WHERE type='sample')::int sample,
              count(*)::int project_total,
              count(*) FILTER (WHERE type='managed')::int project_managed,
              count(*) FILTER (WHERE type='external')::int project_external,
              count(*) FILTER (WHERE type='sample')::int project_sample
              FROM internal_database_inventory`;
            return {
              counts,
              projectCounts: {
                total: counts.project_total,
                managed: counts.project_managed,
                external: counts.project_external,
                sample: counts.project_sample,
              },
            };
          }
          if (p.get("view") === "history") {
            const entries =
              await tx`SELECT id::text,project_name,user_name,user_email,actor_name,actor_email,blocked,reason,created_at
          FROM internal_database_actions ORDER BY internal_database_actions.id DESC LIMIT 51 OFFSET ${(page - 1) * 50}`;
            return { entries: entries.slice(0, 50), more: entries.length > 50 };
          }
          const filter = tx`FROM internal_database_inventory WHERE
        (strpos(lower(name),lower(${search}))>0 OR strpos(lower(email),lower(${search}))>0)
        AND (${workspace}='' OR workspace=${workspace})
        AND (${email}='' OR email=${email})
        AND (${type}='' OR type=${type}) AND (${status}='' OR status=${status})
        AND (${from}::date IS NULL OR created >= (${from}::date::timestamp AT TIME ZONE 'UTC'))
        AND (${until}::date IS NULL OR created < ((${until}::date + 1)::timestamp AT TIME ZONE 'UTC'))`;
          const [countRows, workspaces, emails, matchedRows, rows] =
            await Promise.all([
              tx`SELECT count(distinct user_id)::int total,
                count(distinct user_id) FILTER (WHERE type='managed')::int managed,
                count(distinct user_id) FILTER (WHERE type='external')::int external,
                count(distinct user_id) FILTER (WHERE type='sample')::int sample,
                count(*)::int project_total,
                count(*) FILTER (WHERE type='managed')::int project_managed,
                count(*) FILTER (WHERE type='external')::int project_external,
                count(*) FILTER (WHERE type='sample')::int project_sample
                FROM internal_database_inventory`,
              tx`SELECT DISTINCT workspace FROM internal_database_inventory
                WHERE workspace IS NOT NULL AND workspace <> '' ORDER BY workspace`,
              tx`SELECT DISTINCT email FROM internal_database_inventory
                WHERE email IS NOT NULL AND email <> '' ORDER BY email`,
              tx`SELECT count(*)::int n ${filter}`,
              tx`SELECT * ${filter} ORDER BY ${tx(sort)} ${tx.unsafe(direction)} NULLS LAST,id
                LIMIT ${DATABASE_PAGE_SIZE} OFFSET ${(page - 1) * DATABASE_PAGE_SIZE}`,
            ]);
          const [counts] = countRows;
          const [matched] = matchedRows;
          return {
            counts,
            projectCounts: {
              total: counts.project_total,
              managed: counts.project_managed,
              external: counts.project_external,
              sample: counts.project_sample,
            },
            rows,
            matched: matched.n,
            options: {
              workspaces: workspaces.map((row) => row.workspace),
              emails: emails.map((row) => row.email),
            },
          };
        },
      ),
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    sameOrigin(request);
    const session = await requireAdmin();
    const body = await request.json().catch(() => null);
    if (
      !body ||
      typeof body.id !== "string" ||
      typeof body.owner_id !== "string" ||
      !["managed", "external"].includes(body.type) ||
      typeof body.blocked !== "boolean" ||
      typeof body.reason !== "string" ||
      !body.reason.trim() ||
      body.reason.trim().length > 500
    )
      throw new PublicError(
        "Choose a database and enter a reason (1–500 characters).",
        422,
      );
    const [result] = await getDb(
      false,
    )`SELECT internal_set_database_access(${session.userId},${body.id},
      ${body.owner_id},${body.type},${body.blocked},${body.reason.trim()}) AS outcome`;
    if (result.outcome === "forbidden")
      throw new PublicError("Administrator access required.", 403);
    if (result.outcome !== "ok")
      throw new PublicError(
        "The database changed. Refresh the list and try again.",
        409,
      );
    return json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
