import { type Query, type Row, PublicError } from "./db";
import { model, tableQueries } from "./analytics-sql";
import { filterParams, type Filters, type Resource } from "./filters";
import { catalog, limitations, sortableColumns } from "./catalog";

export async function overview(query: Query, f: Filters) {
  const params = filterParams(f);
  const [summary] = await query(
    model +
      `SELECT
   (SELECT COUNT(*)::int FROM scoped_users) users,
   (SELECT COUNT(*)::int FROM scoped_users WHERE status='active' AND last_active_at >= $2 AND last_active_at < $3) active_users,
   (SELECT COUNT(*)::int FROM scoped_users WHERE created_at >= $2 AND created_at < $3) new_users,
   (SELECT COUNT(*)::int FROM scoped_users WHERE created_at >= $2::timestamptz-($3::timestamptz-$2::timestamptz) AND created_at < $2) previous_users,
   (SELECT COUNT(*)::int FROM scoped_wallets WHERE source='workspace') workspaces,
   (SELECT COUNT(*)::int FROM scoped_workspace_history) workspaces_created,
   (SELECT COUNT(*)::int FROM scoped_workspace_history WHERE created_at >= $2 AND created_at < $3) new_workspaces,
   (SELECT COUNT(DISTINCT user_id)::int FROM scoped_wallets WHERE source='workspace') workspace_owners,
   (SELECT COUNT(*)::int FROM scoped_projects WHERE deleted_at IS NULL) projects,
   (SELECT COUNT(*)::int FROM scoped_projects) projects_created,
   (SELECT COUNT(*)::int FROM scoped_projects WHERE created_at >= $2 AND created_at < $3) new_projects,
   (SELECT COUNT(*)::int FROM scoped_invites) invitations,
   (SELECT COUNT(*)::int FROM scoped_invites WHERE created_at >= $2 AND created_at < $3) new_invitations,
   (SELECT COUNT(*)::int FROM scoped_invites WHERE created_at >= $2 AND created_at < $3 AND status='accepted') accepted_invitations,
   (SELECT COUNT(*)::int FROM scoped_wallets WHERE subscription_status='active') active_subscriptions,
   (SELECT COUNT(DISTINCT user_id)::int FROM scoped_wallets WHERE subscription_status='active') paying_customers,
   (SELECT COUNT(*)::int FROM scoped_users c WHERE NOT EXISTS(SELECT 1 FROM scoped_wallets s WHERE s.user_id=c.id AND s.subscription_status='active')) free_or_expired_users,
   (SELECT COALESCE(SUM(remaining),0)::float FROM scoped_wallets) remaining,
   (SELECT COALESCE(SUM(credits),0)::float FROM period_usage) credits,
   (SELECT COALESCE(SUM(credits),0)::float FROM scoped_usage WHERE created_at >= $2::timestamptz-($3::timestamptz-$2::timestamptz) AND created_at < $2) previous_credits,
   (SELECT COUNT(*)::int FROM period_usage) operations,
   (SELECT COALESCE(SUM(amount_paise),0)::float/100 FROM period_payments WHERE verified) gross,
   (SELECT COALESCE(SUM(amount_paise),0)::float/100 FROM scoped_payments WHERE verified) lifetime_gross,
   (SELECT COALESCE(SUM(amount_paise),0)::float/100 FROM scoped_payments WHERE verified AND event_at >= date_trunc('month',$1::timestamptz AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AND event_at < $1) month_gross,
   (SELECT COALESCE(SUM(amount_paise),0)::float/100 FROM scoped_payments WHERE verified AND event_at >= date_trunc('day',$1::timestamptz AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AND event_at < $1) today_gross,
   (SELECT COALESCE(SUM(amount_paise),0)::float/100 FROM scoped_payments WHERE verified AND event_at >= $2::timestamptz-($3::timestamptz-$2::timestamptz) AND event_at < $2) previous_gross,
   (SELECT COUNT(*)::int FROM period_payments WHERE verified AND status='paid') successful,
   (SELECT COUNT(*)::int FROM period_payments WHERE status='failed') failed,
   (SELECT COUNT(*)::int FROM period_payments WHERE status='created') pending,
   (SELECT COUNT(*)::int FROM period_payments WHERE status='refunded') refunded,
   (SELECT COUNT(*)::int FROM period_payments WHERE status='paid' AND NOT verified) unverified,
   NULL::numeric mrr,NULL::numeric allocated,NULL::numeric refunds,NULL::numeric net_revenue`,
    params,
  );
  const series = await query(
    model +
      `, dates AS (
    SELECT generate_series(date_trunc($8,$2::timestamptz AT TIME ZONE 'UTC'),date_trunc($8,($3::timestamptz-interval '1 microsecond') AT TIME ZONE 'UTC'),('1 '||$8)::interval) AS day
   ), events AS (
    SELECT created_at occurred_at,1::float users,0::float workspaces,0::float projects,0::float credits,0::float revenue,0::float invitations FROM scoped_users
    UNION ALL SELECT created_at,0,1,0,0,0,0 FROM scoped_workspace_history
    UNION ALL SELECT created_at,0,0,1,0,0,0 FROM scoped_projects
    UNION ALL SELECT created_at,0,0,0,credits::float,0,0 FROM scoped_usage
    UNION ALL SELECT event_at,0,0,0,0,amount_paise::float/100,0 FROM scoped_payments WHERE verified
    UNION ALL SELECT created_at,0,0,0,0,0,1 FROM scoped_invites
   ), totals AS (SELECT date_trunc($8,occurred_at AT TIME ZONE 'UTC') AS day,SUM(users) users,SUM(workspaces) workspaces,SUM(projects) projects,SUM(credits) credits,SUM(revenue) revenue,SUM(invitations) invitations
    FROM events WHERE occurred_at>=$2 AND occurred_at<$3 GROUP BY 1)
   SELECT to_char(d.day,'YYYY-MM-DD') AS day,COALESCE(t.users,0) users,COALESCE(t.workspaces,0) workspaces,COALESCE(t.projects,0) projects,
   COALESCE(t.credits,0) credits,COALESCE(t.revenue,0) revenue,COALESCE(t.invitations,0) invitations FROM dates d LEFT JOIN totals t USING(day) ORDER BY d.day`,
    [...params, f.granularity],
  );
  const plans = await query(
    model +
      `SELECT s.plan_key key,COUNT(*)::int selected,COUNT(DISTINCT s.user_id)::int users,
    COUNT(*) FILTER(WHERE subscription_status='active')::int active,
    COUNT(*) FILTER(WHERE subscription_status='inactive')::int inactive,
    COUNT(*) FILTER(WHERE subscription_status='expired')::int expired,
    COUNT(*) FILTER(WHERE subscription_status='pending')::int pending,
    COUNT(*) FILTER(WHERE subscription_status='unknown')::int unknown,
    COUNT(*) FILTER(WHERE plan_started_at>=$2 AND plan_started_at<$3)::int new
   FROM scoped_wallets s GROUP BY s.plan_key`,
    params,
  );
  const purchases = await query(
    model +
      `SELECT plan_key key,COUNT(DISTINCT user_id) FILTER(WHERE verified)::int ever_purchased,
    COALESCE(SUM(amount_paise) FILTER(WHERE verified),0)::float/100 gross,COUNT(*) FILTER(WHERE status='created')::int pending_orders
    FROM scoped_payments WHERE verified OR status='created' GROUP BY plan_key`,
    params,
  );
  // Revenue must exclude unconfirmed orders even when reporting pending counts.
  const revenueByPlan = await query(
    model +
      `SELECT plan_key key,COUNT(DISTINCT user_id)::int purchasers,COALESCE(SUM(amount_paise),0)::float/100 revenue
    FROM period_payments WHERE verified GROUP BY plan_key ORDER BY revenue DESC`,
    params,
  );
  const breakdowns: Record<string, Row[]> = {};
  const dimensions = {
    user: ["x.user_id", "u.name"],
    workspace: ["x.workspace_id", "w.name"],
    project: ["x.project_id", "x.project_name"],
    operation: ["x.operation", "x.operation"],
    plan: ["x.plan_key", "x.plan_key"],
  };
  for (const [dimension, [id, name]] of Object.entries(dimensions)) {
    breakdowns[dimension] = await query(
      model +
        `SELECT ${id} id,COALESCE(MAX(${name}),'Unattributed') name,SUM(x.credits)::float credits,COUNT(*)::int operations
      FROM period_usage x JOIN customers u ON u.id=x.user_id LEFT JOIN customer_workspaces w ON w.id=x.workspace_id
      GROUP BY ${id} ORDER BY credits DESC, id LIMIT 50`,
      params,
    );
  }
  const notifications = [
    ...(Number(summary.unverified) > 0
      ? [
          {
            title: "Payment verification needs attention",
            detail: `${summary.unverified} paid records lack provider confirmation fields and are excluded from revenue.`,
            section: "payments",
          },
        ]
      : []),
    ...(Number(summary.failed) > 0
      ? [
          {
            title: "Failed payments",
            detail: `${summary.failed} failed transactions in this reporting period.`,
            section: "payments",
          },
        ]
      : []),
    ...(Number(summary.pending) > 0
      ? [
          {
            title: "Pending payment orders",
            detail: `${summary.pending} orders are awaiting verified payment.`,
            section: "payments",
          },
        ]
      : []),
  ];
  return {
    asOf: f.asOf,
    filters: f,
    summary,
    series,
    plans,
    catalog,
    purchases,
    revenueByPlan,
    breakdowns,
    limitations,
    notifications,
  };
}

export async function table(
  query: Query,
  resource: Resource,
  f: Filters,
  options: { id?: string; export?: boolean; allDates?: boolean } = {},
) {
  const params = filterParams(f);
  const add = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };
  const clauses: string[] = [];
  if (
    !options.allDates &&
    !options.id &&
    !["credits", "payments"].includes(resource)
  ) {
    // Lists are cohorts created in the selected period. Profile links can inspect older records.
    clauses.push(
      `r.created_at>=${add(f.start)}::timestamptz AND r.created_at<${add(f.end)}::timestamptz`,
    );
  }
  if (options.id) clauses.push(`r.id=${add(options.id)}`);
  if (f.q) {
    const term = add("%" + f.q.replace(/[\\%_]/g, "\\$&") + "%");
    const fields =
      resource === "users"
        ? ["id", "name", "email"]
        : resource === "credits"
          ? ["id", "user", "email", "project", "workspace", "action"]
          : resource === "payments"
            ? ["id", "user", "email", "order_id", "provider_payment_id"]
            : [
                "id",
                ...(resource === "invitations"
                  ? ["email", "workspace"]
                  : ["name"]),
                ...(resource === "members"
                  ? ["email"]
                  : resource === "invitations"
                    ? []
                    : ["owner", "email"]),
              ];
    clauses.push(
      "(" +
        fields
          .map((key) => `r."${key}" ILIKE ${term} ESCAPE '\\'`)
          .join(" OR ") +
        ")",
    );
  }
  if (f.status && resource !== "credits" && resource !== "members")
    clauses.push(`r.status=${add(f.status)}`);
  if (f.status && resource === "credits")
    clauses.push(`r.operation=${add(f.status)}`);
  if (f.status && resource === "members")
    clauses.push(`r.role=${add(f.status)}`);
  if (f.activity && resource === "users")
    clauses.push(
      f.activity === "active"
        ? `r.last_active_at>=${add(f.start)}::timestamptz AND r.last_active_at<${add(f.end)}::timestamptz`
        : `(r.last_active_at IS NULL OR r.last_active_at<${add(f.start)}::timestamptz)`,
    );
  const filtered =
    model +
    `, records AS (${tableQueries[resource]}), filtered AS (SELECT * FROM records r ${clauses.length ? "WHERE " + clauses.join(" AND ") : ""}) `;
  const [count] = await query(
    filtered + "SELECT COUNT(*)::int total FROM filtered",
    params,
  );
  if (options.export && Number(count.total) > 50000)
    throw new PublicError(
      "This export exceeds 50,000 rows. Narrow the date range or filters and retry.",
      422,
    );
  const sort = sortableColumns[resource].includes(f.sort)
    ? f.sort
    : sortableColumns[resource][0];
  const size = options.export ? 50000 : f.pageSize;
  const page = options.export
    ? 1
    : Math.min(f.page, Math.max(1, Math.ceil(Number(count.total) / size)));
  const rows = await query(
    filtered +
      `SELECT * FROM filtered ORDER BY "${sort}" ${f.direction} NULLS LAST,id ${f.direction} LIMIT ${add(size)} OFFSET ${add((page - 1) * size)}`,
    params,
  );
  return {
    rows,
    total: Number(count.total),
    page,
    pageSize: size,
    sort,
    direction: f.direction,
  };
}
export async function detail(
  query: Query,
  resource: Resource,
  id: string,
  f: Filters,
) {
  if (
    !["users", "workspaces", "projects", "payments", "subscriptions"].includes(
      resource,
    )
  )
    throw new PublicError("This record does not have a detail view.", 404);
  const clean = {
    ...f,
    user: "",
    workspace: "",
    project: "",
    plan: "",
    status: "",
    q: "",
    activity: "",
  };
  const result = await table(query, resource, clean, { id, allDates: true });
  if (!result.rows[0])
    throw new PublicError(
      "Record not found in the selected reporting period.",
      404,
    );
  return { record: result.rows[0], resource, asOf: f.asOf, limitations };
}
export async function search(query: Query, q: string) {
  if (q.length < 2) return [];
  const term = "%" + q.slice(0, 100).replace(/[\\%_]/g, "\\$&") + "%";
  return query(
    `SELECT * FROM (
   (SELECT id,name,email description,'users' kind FROM users WHERE role='customer' AND (name ILIKE $1 ESCAPE '\\' OR email ILIKE $1 ESCAPE '\\' OR id ILIKE $1 ESCAPE '\\') ORDER BY created_at DESC LIMIT 6)
   UNION ALL (SELECT id,name,id,'workspaces' FROM customer_workspaces WHERE name ILIKE $1 ESCAPE '\\' OR id ILIKE $1 ESCAPE '\\' ORDER BY created_at DESC LIMIT 6)
   UNION ALL (SELECT id,name,id,'projects' FROM ai_projects WHERE name ILIKE $1 ESCAPE '\\' OR id ILIKE $1 ESCAPE '\\' ORDER BY created_at DESC LIMIT 6)
  ) found LIMIT 18`,
    [term],
  );
}
