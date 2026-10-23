import { test } from "node:test";
import assert from "node:assert/strict";
import { signSession, verifySession, authorizeSession } from "../lib/session";
import { parseFilters, toCsv } from "../lib/filters";
const secret = "a-secure-test-only-key-at-least-32-characters";
test("only a valid unexpired administrator token verifies", () => {
  const session = {
    userId: "u",
    email: "admin@example.test",
    name: "Admin",
    role: "admin",
    issuedAt: 100,
    expiresAt: 200,
  };
  const token = signSession(session, secret);
  assert.equal(verifySession(token, secret, 150)?.userId, "u");
  assert.equal(verifySession(token, secret, 201), null);
  assert.equal(verifySession(token + "tampered", secret, 150), null);
  assert.equal(
    verifySession(
      signSession({ ...session, role: "customer" }, secret),
      secret,
      150,
    ),
    null,
  );
  assert.equal(
    verifySession(
      signSession({ ...session, role: "editor" }, secret),
      secret,
      150,
    ),
    null,
  );
  assert.equal(
    verifySession(
      signSession({ ...session, expiresAt: 100000 }, secret),
      secret,
      150,
    ),
    null,
  );
  assert.equal(verifySession(token, "short", 150), null);
});
test("dates reject rollover, excessive ranges, unsupported intervals, and invalid pagination", () => {
  const cases: Record<string, string>[] = [
    { period: "custom", start: "2026-02-30", end: "2026-03-02" },
    { period: "custom", start: "2020-01-01", end: "2026-10-01" },
    { page: "0" },
    { pageSize: "50000" },
    { granularity: "quarter;drop table users" },
  ];
  for (const params of cases)
    assert.throws(() =>
      parseFilters(new URLSearchParams(params), new Date("2026-10-22")),
    );
});
test("CSV quotes cells and neutralizes spreadsheet formula injection", () => {
  const csv = toCsv(
    [
      {
        name: '=HYPERLINK("https://example.test")',
        note: "line1\nline2",
        value: 5,
      },
    ],
    ["name", "note", "value"],
  );
  assert.ok(csv.includes('"\'=HYPERLINK(""https://example.test"")"'));
  assert.ok(csv.includes('"line1\nline2"'));
});
test("server rechecks current role and suspension despite a signed admin token", async () => {
  const token = signSession(
    {
      userId: "u",
      email: "old@example.test",
      name: "Admin",
      role: "admin",
      issuedAt: 100,
      expiresAt: 200,
    },
    secret,
  );
  const lookup = async () => ({
    name: "Updated name",
    email: "new@example.test",
    role: "admin",
    status: "active",
  });
  assert.equal(
    (await authorizeSession(token, secret, lookup, 150))?.name,
    "Updated name",
  );
  assert.equal(
    await authorizeSession(
      token,
      secret,
      async () => ({ ...(await lookup()), role: "customer" }),
      150,
    ),
    null,
  );
  assert.equal(
    await authorizeSession(
      token,
      secret,
      async () => ({ ...(await lookup()), status: "suspended" }),
      150,
    ),
    null,
  );
  assert.equal(
    await authorizeSession(token, secret, async () => null, 150),
    null,
  );
});
