import assert from "node:assert/strict";
const origin = process.env.TEST_APP_ORIGIN || "http://localhost:3100";
for (const view of [
  "overview",
  "settings",
  "search&q=example",
  "table&resource=users",
  "detail&resource=users&id=unknown",
  "export&resource=payments",
]) {
  const res = await fetch(`${origin}/api/admin?view=${view}`, {
    headers: {
      "x-cognilune-user-id": "admin",
      "x-cognilune-role": "admin",
      cookie: "horizon_internal_session=forged",
    },
  });
  assert.equal(res.status, 401, view);
  assert.match(res.headers.get("cache-control"), /no-store/);
}
const page = await fetch(`${origin}/overview`, { redirect: "manual" });
assert.equal(page.status, 307);
assert.equal(page.headers.get("location"), "/login");
const crossOrigin = await fetch(`${origin}/api/auth/login`, {
  method: "POST",
  headers: {
    origin: "https://untrusted.example",
    "content-type": "application/json",
  },
  body: JSON.stringify({
    email: "nobody@example.test",
    password: "not-a-real-password",
  }),
});
assert.equal(crossOrigin.status, 403);
const logout = await fetch(`${origin}/api/auth/logout`, {
  method: "POST",
  headers: { origin: "https://untrusted.example" },
});
assert.equal(logout.status, 403);
console.log(
  "Passed: protected pages, all analytics views, spoofed identity headers, forged sessions, cache protection, and cross-origin sign-in/sign-out.",
);
