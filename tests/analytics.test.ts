import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./fixture";
import { overview, table, detail, search } from "../lib/analytics";
import { parseFilters, resources } from "../lib/filters";
let db: Awaited<ReturnType<typeof fixture>>;
const now = new Date("2026-10-22T12:00:00Z");
const filters = (extra: Record<string, string> = {}) =>
  parseFilters(new URLSearchParams({ period: "30d", ...extra }), now);
before(async () => {
  db = await fixture();
});
after(async () => {
  await db?.pg.close();
});
test("overview reconciles wallets, reservations and provider-confirmed payments", async () => {
  const data = await overview(db.query, filters());
  assert.equal(data.summary.users, 3);
  assert.equal(data.summary.active_users, 2);
  assert.equal(data.summary.projects, 2);
  assert.equal(
    data.summary.credits,
    9,
    "3 recorded + 2 unrecorded committed + 4 recorded; exclude reserved/refunded",
  );
  assert.equal(
    data.summary.gross,
    1198,
    "exclude duplicate order, pending payment and unconfirmed paid record",
  );
  assert.equal(
    data.summary.remaining,
    122,
    "42 workspace + 80 expired-plan stored subscription credits; no duplicate account wallet",
  );
  assert.equal(data.summary.active_subscriptions, 1);
  assert.equal(data.summary.unverified, 1);
  assert.equal(data.summary.mrr, null);
  assert.equal(data.summary.refunds, null);
  assert.equal(data.summary.allocated, null);
  assert.equal(
    data.series.reduce((sum, r) => sum + Number(r.credits), 0),
    9,
  );
  assert.equal(
    data.series.reduce((sum, r) => sum + Number(r.revenue), 0),
    1198,
  );
  const ledger = await table(db.query, "credits", filters());
  assert.equal(
    ledger.rows.reduce((n, r) => n + Number(r.credits), 0),
    9,
  );
});
test("resource queries, search, scope and detail work against PostgreSQL", async () => {
  for (const resource of resources) {
    const result = await table(db.query, resource, filters(), {
      allDates: true,
    });
    assert.ok(Array.isArray(result.rows), resource);
  }
  const scoped = await overview(
    db.query,
    filters({ workspace: "w1", project: "p1" }),
  );
  assert.equal(scoped.summary.credits, 5);
  assert.equal(scoped.summary.gross, 0, "Project revenue is not allocated");
  const result = await detail(db.query, "users", "alice", filters());
  assert.equal(result.record.name, "Alice Test");
  assert.equal((await search(db.query, "studio"))[0].kind, "projects");
  const empty = await table(db.query, "users", filters({ q: "' OR 1=1 --" }));
  assert.equal(empty.total, 0);
});
test("date boundaries are half-open; comparisons use equal prior durations", async () => {
  const data = await overview(
    db.query,
    filters({ period: "custom", start: "2026-10-20", end: "2026-10-20" }),
  );
  assert.equal(data.summary.credits, 3);
  assert.equal(data.series.length, 1);
  const weekly = await overview(db.query, filters({ granularity: "week" }));
  assert.equal(
    weekly.series.reduce((n, r) => n + Number(r.credits), 0),
    9,
  );
});
test("historical paid plan filtering is independent of current workspace plan", async () => {
  const result = await table(
    db.query,
    "payments",
    filters({ plan: "account:starter" }),
  );
  assert.equal(result.total, 2);
});
test("only verified purchasers count as ever purchased", async () => {
  const data = await overview(db.query, filters());
  const plan = data.purchases.find((p) => p.key === "account:pro");
  assert.equal(plan?.ever_purchased, 0);
});
test("a source paid flag without provider confirmation is never displayed as paid", async () => {
  const result = await table(
    db.query,
    "payments",
    filters({ status: "unverified" }),
  );
  assert.equal(result.total, 1);
  assert.equal(result.rows[0].recorded_status, "paid");
  assert.equal(result.rows[0].verified, false);
});
test("deleted records remain inspectable; old creation cohorts do not masquerade as empty detail", async () => {
  const data = await detail(db.query, "projects", "deleted", filters());
  assert.equal(data.record.status, "deleted");
  const all = await table(
    db.query,
    "users",
    filters({ page: "999", pageSize: "10" }),
    { allDates: true },
  );
  assert.equal(all.page, 1);
});
test("workspace scopes retain member-created projects and charge the correct wallet owner", async () => {
  await db.pg.exec("BEGIN");
  try {
    await db.pg
      .exec(`INSERT INTO ai_projects VALUES ('member-project','bob','w1',NULL,'Member creation','2026-10-20','2026-10-21',NULL);
   INSERT INTO customer_credit_usage VALUES (9,'bob','bob','member-project',NULL,'Member creation','Build',7,'2026-10-21','build','{}');`);
    const workspace = await overview(db.query, filters({ workspace: "w1" }));
    assert.equal(workspace.summary.credits, 12);
    assert.equal(workspace.summary.projects, 2);
    const project = await overview(
      db.query,
      filters({ project: "member-project" }),
    );
    assert.equal(project.summary.credits, 7);
    const ledger = await table(
      db.query,
      "credits",
      filters({ project: "member-project" }),
    );
    assert.equal(ledger.rows[0].user_id, "alice");
    assert.equal(ledger.rows[0].actor_id, "bob");
  } finally {
    await db.pg.exec("ROLLBACK");
  }
});
test("confirmed payment data wins over a pending duplicate in the other billing generation", async () => {
  await db.pg.exec("BEGIN");
  try {
    await db.pg.exec(
      `INSERT INTO customer_workspace_payments VALUES ('confirmed-workspace','w2','bob','business','monthly',149900,'paid','order2','provider2','2026-10-02','2026-10-02');`,
    );
    const result = await overview(db.query, filters());
    assert.equal(result.summary.gross, 2697);
    assert.equal(result.summary.pending, 0);
  } finally {
    await db.pg.exec("ROLLBACK");
  }
});
test("duplicate ledger writes for one reservation count once", async () => {
  await db.pg.exec("BEGIN");
  try {
    await db.pg.exec(
      `INSERT INTO customer_credit_usage VALUES (10,'alice','alice','p1','c1','Brand studio','Build',3,'2026-10-21','build','{"reservationId":"r1"}');`,
    );
    const result = await overview(db.query, filters());
    assert.equal(result.summary.credits, 9);
    assert.equal(result.summary.operations, 3);
  } finally {
    await db.pg.exec("ROLLBACK");
  }
});
test("numeric sorting, membership roles and literal wildcard searches preserve report semantics", async () => {
  const result = await table(
    db.query,
    "users",
    filters({ sort: "credits_used", direction: "desc" }),
    { allDates: true },
  );
  assert.equal(result.rows[0].id, "alice");
  assert.equal(
    (
      await table(db.query, "members", filters({ status: "editor" }), {
        allDates: true,
      })
    ).rows[0].user_id,
    "bob",
  );
  assert.equal(
    (await table(db.query, "users", filters({ q: "%" }), { allDates: true }))
      .total,
    0,
  );
});
