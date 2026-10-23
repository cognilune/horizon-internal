"use client";
import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import { date, money, number, Empty, type DataRow } from "./Charts";
import { planLabel, sortableColumns } from "@/lib/catalog";
type Column = {
  key: string;
  label: string;
  type?: "date" | "number" | "money" | "badge" | "plan" | "person" | "boolean";
};
const c = (key: string, label: string, type?: Column["type"]): Column => ({
  key,
  label,
  type,
});
export const columns: Record<string, Column[]> = {
  users: [
    c("name", "User", "person"),
    c("plan", "Current plans", "plan"),
    c("status", "Account status", "badge"),
    c("subscription_status", "Subscription", "badge"),
    c("credits_used", "Credits used", "number"),
    c("remaining", "Balance now", "number"),
    c("workspaces", "Workspaces", "number"),
    c("projects", "Projects created", "number"),
    c("invited_members", "Invited", "number"),
    c("total_paid", "Lifetime gross", "money"),
    c("credit_allowance", "Daily + plan allowance", "number"),
    c("usage_percentage", "Lifetime usage %", "number"),
    c("created_at", "Registered", "date"),
    c("last_active_at", "Last active", "date"),
    c("id", "User ID"),
  ],
  subscriptions: [
    c("name", "Workspace / account"),
    c("owner", "Owner", "person"),
    c("plan", "Plan", "plan"),
    c("status", "Status", "badge"),
    c("billing_interval", "Billing cycle"),
    c("remaining", "Balance now", "number"),
    c("plan_allowance", "Plan credits", "number"),
    c("daily_limit", "Daily credits", "number"),
    c("daily_remaining", "Daily balance", "number"),
    c("plan_balance", "Plan balance", "number"),
    c("topup_balance", "Top-up balance", "number"),
    c("rollover_balance", "Rollover balance", "number"),
    c("daily_reset_at", "Next daily reset", "date"),
    c("available_until", "Daily eligibility ends", "date"),
    c("created_at", "Plan started", "date"),
    c("expires_at", "Expires", "date"),
    c("confirmed_purchases", "Confirmed purchases", "number"),
    c("source", "Source"),
    c("id", "ID"),
  ],
  workspaces: [
    c("name", "Workspace"),
    c("owner", "Owner", "person"),
    c("plan", "Plan", "plan"),
    c("members", "Members", "number"),
    c("projects", "Projects", "number"),
    c("credits_used", "Credits used", "number"),
    c("remaining", "Balance now", "number"),
    c("status", "Status", "badge"),
    c("invitations", "Invitations", "number"),
    c("accepted", "Accepted", "number"),
    c("pending", "Pending", "number"),
    c("created_at", "Created", "date"),
    c("id", "Workspace ID"),
  ],
  projects: [
    c("name", "Project"),
    c("owner", "Owner", "person"),
    c("workspace", "Workspace"),
    c("credits_used", "Credits used", "number"),
    c("operations", "Operations", "number"),
    c("status", "Status", "badge"),
    c("created_at", "Created", "date"),
    c("updated_at", "Updated", "date"),
    c("id", "Project ID"),
  ],
  credits: [
    c("created_at", "Date & time", "date"),
    c("user", "Owner", "person"),
    c("actor", "Performed by"),
    c("workspace", "Workspace"),
    c("project", "Project"),
    c("operation", "Operation", "badge"),
    c("credits", "Credits", "number"),
    c("plan", "Current plan", "plan"),
    c("action", "Action"),
    c("balance_after", "Balance after", "number"),
    c("source", "Source"),
    c("id", "Event ID"),
  ],
  payments: [
    c("user", "Customer", "person"),
    c("amount", "Amount", "money"),
    c("currency", "Currency"),
    c("plan", "Purchased plan", "plan"),
    c("status", "Status", "badge"),
    c("verified", "Confirmed", "boolean"),
    c("paid_at", "Paid at", "date"),
    c("method", "Method"),
    c("workspace", "Workspace"),
    c("order_id", "Order / invoice"),
    c("provider_payment_id", "Provider payment ID"),
    c("created_at", "Created", "date"),
    c("id", "Transaction ID"),
  ],
  invitations: [
    c("email", "Invitee"),
    c("workspace", "Workspace"),
    c("invited_by_name", "Invited by"),
    c("role", "Role", "badge"),
    c("status", "Status", "badge"),
    c("created_at", "Sent", "date"),
    c("accepted_at", "Accepted", "date"),
    c("expires_at", "Expires", "date"),
    c("id", "Invitation ID"),
  ],
  members: [
    c("name", "Member", "person"),
    c("workspace", "Workspace"),
    c("role", "Role", "badge"),
    c("monthly_credit_limit", "Monthly credit limit", "number"),
    c("created_at", "Joined", "date"),
    c("id", "Membership ID"),
  ],
};
export function Badge({ value }: { value: unknown }) {
  const text = String(value || "unavailable");
  return (
    <span
      className={`badge badge-${text.split(",")[0].replace(/[^a-z_]/g, "")}`}
    >
      <i />
      {text.replaceAll("_", " ")}
    </span>
  );
}
export function Cell({ row, column }: { row: DataRow; column: Column }) {
  const value = row[column.key];
  if (column.type === "person")
    return (
      <div className="person">
        <span className="avatar">
          {String(value || "?")
            .split(" ")
            .map((v) => v[0])
            .slice(0, 2)
            .join("")}
        </span>
        <span>
          <strong>{String(value || "Unknown")}</strong>
          <small>{String(row.email || "")}</small>
        </span>
      </div>
    );
  if (value === null || value === undefined || value === "")
    return (
      <span className="muted" title="Not recorded by the source">
        —
      </span>
    );
  if (column.type === "badge") return <Badge value={value} />;
  if (column.type === "plan")
    return <span className="plan-label">{planLabel(value)}</span>;
  if (column.type === "date")
    return <span className="nowrap">{date(value, true)}</span>;
  if (column.type === "money")
    return <span className="numeric">{money(value)}</span>;
  if (column.type === "number")
    return <span className="numeric">{number(value)}</span>;
  if (column.type === "boolean")
    return (
      <span className={value ? "verified" : "muted"}>
        {value ? "Verified" : "Unconfirmed"}
      </span>
    );
  return (
    <span
      className={column.key.endsWith("id") ? "identifier" : ""}
      title={String(value)}
    >
      {String(value)}
    </span>
  );
}
export default function DataTable({
  resource,
  params,
  title,
  onOpen,
  refresh = 0,
  compact = false,
}: {
  resource: string;
  params: string;
  title?: string;
  onOpen?: (resource: string, id: string) => void;
  refresh?: number;
  compact?: boolean;
}) {
  const [result, setResult] = useState<{
      rows: DataRow[];
      total: number;
      page: number;
      pageSize: number;
    } | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(true);
  const [page, setPage] = useState(1),
    [size, setSize] = useState(compact ? 10 : 20),
    [sort, setSort] = useState(""),
    [direction, setDirection] = useState("desc"),
    [retry, setRetry] = useState(0),
    [exporting, setExporting] = useState(false);
  useEffect(() => {
    setPage(1);
  }, [params, resource, size, sort, direction]);
  useEffect(() => {
    const abort = new AbortController();
    setBusy(true);
    setError("");
    setResult(null);
    const p = new URLSearchParams(params);
    p.set("view", "table");
    p.set("resource", resource);
    p.set("page", String(page));
    p.set("pageSize", String(size));
    p.set("sort", sort);
    p.set("direction", direction);
    fetch(`/api/admin?${p}`, { signal: abort.signal })
      .then(async (res) => {
        const body = await res.json();
        if (res.status === 401) {
          window.location.assign("/login");
          return;
        }
        if (!res.ok) throw new Error(body.error);
        setResult(body);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      })
      .finally(() => {
        if (!abort.signal.aborted) setBusy(false);
      });
    return () => abort.abort();
  }, [params, resource, page, size, sort, direction, refresh, retry]);
  async function exportCsv() {
    setExporting(true);
    setError("");
    try {
      const p = new URLSearchParams(params);
      p.set("view", "export");
      p.set("resource", resource);
      p.set("sort", sort);
      p.set("direction", direction);
      const res = await fetch(`/api/admin?${p}`);
      if (!res.ok) throw new Error((await res.json()).error);
      const url = URL.createObjectURL(await res.blob()),
        a = document.createElement("a");
      a.href = url;
      a.download = `horizon-${resource}-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setExporting(false);
    }
  }
  const visible = compact ? columns[resource].slice(0, 6) : columns[resource];
  const clickable =
    Boolean(onOpen) &&
    ["users", "workspaces", "projects", "payments", "subscriptions"].includes(
      resource,
    );
  return (
    <section className="panel table-panel">
      <div className="panel-heading">
        <div>
          <h2>
            {title || resource[0].toUpperCase() + resource.slice(1)}
            {result && (
              <span className="count-chip">{number(result.total, 0)}</span>
            )}
          </h2>
          <p>
            {["credits", "payments"].includes(resource)
              ? "Recorded events in the selected period"
              : new URLSearchParams(params).get("allDates") === "true"
                ? "Current records · usage reflects selected period"
                : "Created in the selected period · balances are current"}
          </p>
        </div>
        <button
          className="button small"
          onClick={exportCsv}
          disabled={exporting || busy || result?.total === 0}
        >
          <Icon name="download" size={15} />
          {exporting ? "Exporting…" : "Export CSV"}
        </button>
      </div>
      {error && (
        <div className="error-banner" role="alert">
          {error}
          <button onClick={() => setRetry((v) => v + 1)}>Retry</button>
        </div>
      )}
      {busy ? (
        <div
          className="table-skeleton"
          aria-label="Loading records"
          role="status"
        >
          {Array.from({ length: compact ? 4 : 6 }, (_, i) => (
            <div key={i} />
          ))}
        </div>
      ) : result?.rows.length ? (
        <>
          <div
            className="table-scroll"
            tabIndex={0}
            role="region"
            aria-label={`${resource} table; scroll horizontally for all fields`}
          >
            <table>
              <thead>
                <tr>
                  {visible.map((col) => (
                    <th key={col.key}>
                      {sortableColumns[resource].includes(col.key) ? (
                        <button
                          onClick={() => {
                            setSort(col.key);
                            setDirection(
                              sort === col.key && direction === "desc"
                                ? "asc"
                                : "desc",
                            );
                          }}
                        >
                          {col.label}
                          {sort === col.key ? (
                            <span>{direction === "asc" ? "↑" : "↓"}</span>
                          ) : (
                            <span className="sort-hint">↕</span>
                          )}
                        </button>
                      ) : (
                        col.label
                      )}
                    </th>
                  ))}
                  {clickable && (
                    <th>
                      <span className="sr-only">Details</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row) => (
                  <tr key={String(row.id)}>
                    {visible.map((col, i) => (
                      <td key={col.key}>
                        {i === 0 && clickable ? (
                          <button
                            className="row-link"
                            onClick={() => onOpen!(resource, String(row.id))}
                          >
                            <Cell row={row} column={col} />
                          </button>
                        ) : onOpen &&
                          ["user", "owner"].includes(col.key) &&
                          row.user_id ? (
                          <button
                            className="row-link"
                            onClick={() => onOpen("users", String(row.user_id))}
                          >
                            <Cell row={row} column={col} />
                          </button>
                        ) : onOpen &&
                          col.key === "workspace" &&
                          row.workspace_id ? (
                          <button
                            className="row-link"
                            onClick={() =>
                              onOpen("workspaces", String(row.workspace_id))
                            }
                          >
                            <Cell row={row} column={col} />
                          </button>
                        ) : onOpen &&
                          col.key === "project" &&
                          row.project_id ? (
                          <button
                            className="row-link"
                            onClick={() =>
                              onOpen("projects", String(row.project_id))
                            }
                          >
                            <Cell row={row} column={col} />
                          </button>
                        ) : (
                          <Cell row={row} column={col} />
                        )}
                      </td>
                    ))}
                    {clickable && (
                      <td>
                        <button
                          className="icon-button"
                          aria-label={`Open ${String(row.name || row.user || row.id)}`}
                          onClick={() => onOpen!(resource, String(row.id))}
                        >
                          <Icon name="chevron" size={16} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="table-footer">
            <span>
              {number((result.page - 1) * size + 1, 0)}–
              {number(Math.min(result.page * size, result.total), 0)} of{" "}
              {number(result.total, 0)} records
            </span>
            <div>
              <label>
                Rows{" "}
                <select
                  value={size}
                  onChange={(e) => setSize(Number(e.target.value))}
                >
                  {[10, 20, 50, 100].map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </label>
              <button
                className="icon-button"
                aria-label="Previous page"
                disabled={result.page <= 1}
                onClick={() => setPage(Math.max(1, result.page - 1))}
              >
                <Icon name="chevron" className="rotate" size={16} />
              </button>
              <span>
                Page {result.page} of {Math.ceil(result.total / size)}
              </span>
              <button
                className="icon-button"
                aria-label="Next page"
                disabled={result.page * size >= result.total}
                onClick={() => setPage(result.page + 1)}
              >
                <Icon name="chevron" size={16} />
              </button>
            </div>
          </div>
        </>
      ) : (
        !error && <Empty />
      )}
    </section>
  );
}
