// Configuration, not analytics data. Source: Horizon's canonical
// lib/plan-catalog.ts. Stored workspace codes predate the public names:
// `pro` is Plus and `business` is Pro.
export const catalog = [
  {
    key: "workspace:free",
    name: "Free",
    source: "Workspace",
    monthly: 0,
    yearly: 0,
    credits: 0,
    daily: 5,
    mapping: "Free · 5 daily credits during eligibility",
  },
  {
    key: "workspace:pro",
    name: "Plus",
    source: "Workspace",
    monthly: 799,
    yearly: 7990,
    credits: 40,
    daily: 5,
    mapping: "Horizon Plus",
  },
  {
    key: "workspace:business",
    name: "Pro",
    source: "Workspace",
    monthly: 2499,
    yearly: 24990,
    credits: 120,
    daily: 5,
    mapping: "Horizon Pro",
  },
  {
    key: "workspace:enterprise",
    name: "Enterprise",
    source: "Workspace",
    monthly: null,
    yearly: null,
    credits: null,
    daily: null,
    mapping: "Custom agreement; configured allowance only",
  },
  {
    key: "account:free",
    name: "Free",
    source: "Account",
    monthly: 0,
    yearly: 0,
    credits: 0,
    daily: 5,
    mapping: "Legacy account without a workspace",
  },
  {
    key: "account:starter",
    name: "Starter",
    source: "Account",
    monthly: 799,
    yearly: 7990,
    credits: 40,
    daily: 5,
    mapping: "Equivalent workspace tier: Pro",
  },
  {
    key: "account:pro",
    name: "Pro",
    source: "Account",
    monthly: 2499,
    yearly: 24990,
    credits: 120,
    daily: 5,
    mapping: "Equivalent workspace tier: Business · annual prices differ",
  },
];
export function planLabel(value: unknown) {
  const text = String(value || "");
  return text
    .split(", ")
    .map((key) =>
      catalog.find((p) => p.key === key)?.name
        ? `${catalog.find((p) => p.key === key)!.name} (${key.startsWith("account:") ? "account" : "workspace"})`
        : key.endsWith(":topup")
          ? "Credit top-up"
          : key || "Unassigned",
    )
    .join(", ");
}
export const sortableColumns: Record<string, string[]> = {
  users: [
    "created_at",
    "name",
    "email",
    "last_active_at",
    "credits_used",
    "remaining",
    "total_paid",
    "status",
    "workspaces",
    "projects",
    "invited_members",
    "credit_allowance",
    "id",
  ],
  subscriptions: [
    "created_at",
    "name",
    "owner",
    "plan",
    "status",
    "billing_interval",
    "expires_at",
    "remaining",
    "daily_limit",
    "plan_allowance",
    "confirmed_purchases",
    "source",
    "id",
  ],
  workspaces: [
    "created_at",
    "name",
    "owner",
    "plan",
    "status",
    "members",
    "projects",
    "credits_used",
    "remaining",
    "invitations",
    "accepted",
    "pending",
    "id",
  ],
  projects: [
    "created_at",
    "name",
    "owner",
    "workspace",
    "updated_at",
    "credits_used",
    "operations",
    "status",
    "id",
  ],
  credits: [
    "created_at",
    "credits",
    "events",
    "operation",
    "user",
    "actor",
    "workspace",
    "project",
    "plan",
    "action",
    "source",
    "id",
  ],
  payments: [
    "event_at",
    "created_at",
    "paid_at",
    "amount",
    "status",
    "user",
    "plan",
    "currency",
    "verified",
    "workspace",
    "order_id",
    "provider_payment_id",
    "id",
  ],
  invitations: [
    "created_at",
    "email",
    "status",
    "workspace",
    "invited_by_name",
    "role",
    "accepted_at",
    "expires_at",
    "id",
  ],
  members: [
    "created_at",
    "name",
    "role",
    "workspace",
    "monthly_credit_limit",
    "id",
  ],
};
export const statusOptions: Record<string, string[]> = {
  users: ["active", "blocked"],
  subscriptions: [
    "free",
    "active",
    "inactive",
    "expired",
    "pending",
    "unknown",
  ],
  workspaces: ["active", "pending_payment", "suspended", "closed"],
  projects: ["draft", "published", "deleted"],
  credits: ["build", "plan", "chat", "run"],
  payments: ["paid", "failed", "created", "refunded", "unverified"],
  invitations: ["pending", "accepted", "revoked", "expired"],
  members: ["owner", "admin", "editor", "viewer"],
};
export const limitations = [
  {
    title: "MRR is unavailable",
    detail:
      "Purchases are fixed-term orders. The customer billing tables do not confirm automatic recurring collection; prepaid revenue is not reported as MRR.",
  },
  {
    title: "Refund amount and net revenue are unavailable",
    detail:
      "Refund status exists, but there is no authoritative refund amount or refund event timestamp. Gross receipts include originally confirmed refunded payments.",
  },
  {
    title: "Lifetime allocations are unavailable",
    detail:
      "Daily refills and plan credit replacements are not stored in a complete allocation ledger. Current wallet balances and recorded consumption are reported separately.",
  },
  {
    title: "Balance after each operation is unavailable",
    detail:
      "Usage and reservation records do not preserve the wallet balance after an operation. No historical balance is inferred.",
  },
  {
    title: "Plan history is purchase history",
    detail:
      "Paid orders and current entitlement dates are available; a complete subscription transition and cancellation ledger is not. Current plan breakdowns are not historical plan attribution.",
  },
  {
    title: "Activity has limited coverage",
    detail:
      "Last active uses the latest account session activity or login. It is not a complete historical activity stream. Project timelines include recorded operations and creation/update dates.",
  },
];
