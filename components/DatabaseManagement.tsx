"use client";
import { useEffect, useRef, useState } from "react";
import { Metric } from "./Charts";

const types = {
  managed: "Horizon Database",
  external: "Own PostgreSQL",
  sample: "Sample Data",
};
const DATABASE_PAGE_SIZE = 25;
type Kind = keyof typeof types;
type DatabaseCounts = Record<Kind | "total", number>;
type DatabaseProjectCounts = Record<Kind | "total", number>;
type DatabaseRow = {
  id: string;
  project: string;
  workspace: string;
  owner_id: string;
  name: string;
  email: string;
  type: Kind;
  blocked: boolean;
  connection: string;
  status: string;
  created: string | null;
  activity: string | null;
};
type Result = {
  counts: DatabaseCounts;
  projectCounts: DatabaseProjectCounts;
  rows: DatabaseRow[];
  matched: number;
  options: {
    workspaces: string[];
    emails: string[];
  };
};

export function DatabaseOverview({
  refresh,
  onOpen,
}: {
  refresh: number;
  onOpen: () => void;
}) {
  const [counts, setCounts] = useState<DatabaseCounts | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    fetch("/api/database?view=summary", {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.error || "Could not load database usage.");
        if (!controller.signal.aborted) setCounts(result.counts);
      })
      .catch((reason) => {
        if (reason.name !== "AbortError") setError(reason.message);
      });
    return () => controller.abort();
  }, [refresh]);
  return (
    <section className="database-overview" aria-labelledby="database-overview-title">
      <div className="database-overview-heading">
        <div>
          <h2 id="database-overview-title">Database usage</h2>
          <p>Current users across every Horizon database option</p>
        </div>
        <button className="button" onClick={onOpen}>
          View databases
        </button>
      </div>
      {error ? (
        <p className="error-banner" role="alert">{error}</p>
      ) : (
        <div className="database-cards">
          {Object.entries(types).map(([key, label]) => (
            <Metric
              key={key}
              icon="database"
              label={label + " Users"}
              value={counts?.[key as Kind]}
              onClick={onOpen}
            />
          ))}
          <Metric
            icon="users"
            accent
            label="Total Database Users"
            value={counts?.total}
            note="Distinct users across all three types"
            onClick={onOpen}
          />
        </div>
      )}
    </section>
  );
}
const displayDate = (value: string | null) =>
  value ? new Date(value).toLocaleString() : "—";

function DatabaseDate({ value }: { value: string | null }) {
  if (!value) return <span className="database-empty">—</span>;
  const date = new Date(value);
  return (
    <time className="database-date" dateTime={date.toISOString()}>
      <span>
        {date.toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          year: "numeric",
        })}
      </span>
      <small>
        {date.toLocaleTimeString(undefined, {
          hour: "numeric",
          minute: "2-digit",
        })}
      </small>
    </time>
  );
}

function ConnectionStatus({ value }: { value: string }) {
  const normalized = value.toLowerCase();
  const connected = normalized === "ready" || normalized === "connected";
  const sample =
    normalized === "static sample data" || normalized === "static website";
  const label = connected
    ? "Connected"
    : sample
      ? "Static website"
      : normalized === "unavailable"
        ? "Unavailable"
        : "Disconnected";
  return (
    <span
      className={`database-connection database-connection-${connected ? "connected" : sample ? "sample" : "disconnected"}`}
      title={value}
    >
      <i aria-hidden="true" />
      {label}
    </span>
  );
}

type AuditEntry = {
  id: string;
  project_name: string;
  user_name: string;
  user_email: string;
  actor_name: string;
  actor_email: string;
  blocked: boolean;
  reason: string;
  created_at: string;
};
function ActionHistory({ refresh }: { refresh: number }) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<{
    entries: AuditEntry[];
    more: boolean;
  } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setResult(null);
    setError("");
    async function load() {
      const response = await fetch("/api/database?view=history&page=" + page, {
        signal: controller.signal,
        cache: "no-store",
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Could not load action history.");
      if (!controller.signal.aborted) setResult(body);
    }
    load().catch((e) => {
      if (!controller.signal.aborted) setError(e.message);
    });
    return () => controller.abort();
  }, [open, page, refresh]);
  return (
    <details
      className="panel database-history"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>Database action history</summary>
      {open &&
        (error ? (
          <p role="alert">{error}</p>
        ) : !result ? (
          <p role="status">Loading history…</p>
        ) : (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    {[
                      "When",
                      "Project",
                      "User",
                      "Administrator",
                      "Action",
                      "Reason",
                    ].map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.entries.map((entry) => (
                    <tr key={entry.id}>
                      <td>{displayDate(entry.created_at)}</td>
                      <td>{entry.project_name}</td>
                      <td>
                        {entry.user_name}
                        <br />
                        {entry.user_email}
                      </td>
                      <td>
                        {entry.actor_name}
                        <br />
                        {entry.actor_email}
                      </td>
                      <td>{entry.blocked ? "Blocked" : "Unblocked"}</td>
                      <td>{entry.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="table-footer">
              <span>
                {result.entries.length
                  ? "Page " + page
                  : "No database actions recorded"}
              </span>
              <div>
                <button
                  className="button"
                  disabled={page === 1}
                  onClick={() => setPage((n) => n - 1)}
                >
                  Previous
                </button>{" "}
                <button
                  className="button"
                  disabled={!result.more}
                  onClick={() => setPage((n) => n + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        ))}
    </details>
  );
}
export default function DatabaseManagement({ refresh }: { refresh: number }) {
  const [filters, setFilters] = useState({
    workspace: "",
    email: "",
    q: "",
    type: "",
    status: "",
    from: "",
    until: "",
    sort: "created",
    direction: "desc",
  });
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState<Result | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [target, setTarget] = useState<DatabaseRow | null>(null);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  function filter(key: keyof typeof filters, value: string) {
    setFilters((previous) => ({ ...previous, [key]: value }));
    setPage(1);
  }
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    async function load() {
      try {
        const params = new URLSearchParams({ ...filters, page: String(page) });
        const response = await fetch("/api/database?" + params, {
          signal: controller.signal,
          cache: "no-store",
        });
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.error || "Could not load databases.");
        if (!controller.signal.aborted) setData(result);
      } catch (e) {
        if (!controller.signal.aborted) {
          setError((e as Error).message);
          setData(null);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    load();
    return () => controller.abort();
  }, [filters, page, revision, refresh]);
  useEffect(() => {
    if (target) dialog.current?.showModal();
  }, [target]);
  async function confirm(event: React.FormEvent) {
    event.preventDefault();
    if (!target || saving || !reason.trim()) return;
    setSaving(true);
    setActionError("");
    try {
      const response = await fetch("/api/database", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: target.id,
          type: target.type,
          owner_id: target.owner_id,
          blocked: !target.blocked,
          reason,
        }),
      });
      if (!response.ok)
        throw new Error(
          (await response.json()).error || "Unable to update access.",
        );
      setTarget(null);
      setRevision((n) => n + 1);
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="dashboard-content database-management">
      <div className="database-cards">
        {Object.entries(types).map(([key, label]) => (
          <Metric
            key={key}
            icon="database"
            label={label + " Users"}
            value={data?.counts[key as Kind]}
          />
        ))}
        <Metric
          icon="users"
          accent
          label="Total Database Users"
          value={data?.counts.total}
          note="Distinct users across all three types"
        />
      </div>
      <div className="database-project-summary">
        <div className="database-section-heading">
          <h2>Project database usage</h2>
          <p>Projects and static websites by their current data source</p>
        </div>
        <div className="database-cards">
          <Metric
            icon="database"
            label="Horizon Database Projects"
            value={data?.projectCounts.managed}
            note="Projects using a Horizon-managed database"
          />
          <Metric
            icon="database"
            label="Own PostgreSQL Projects"
            value={data?.projectCounts.external}
            note="Projects connected to an external PostgreSQL database"
          />
          <Metric
            icon="projects"
            label="Static Websites"
            value={data?.projectCounts.sample}
            note="Websites using sample data without a database"
          />
          <Metric
            icon="projects"
            accent
            label="Total Database Projects"
            value={data?.projectCounts.total}
            note="All projects across the three data-source types"
          />
        </div>
      </div>
      <section className="panel" aria-labelledby="database-users">
        <div className="panel-heading">
          <h2 id="database-users">User databases</h2>
          <button className="button" onClick={() => setRevision((n) => n + 1)}>
            Refresh
          </button>
        </div>
        <div className="database-filters">
          <label>
            Search users
            <input
              type="search"
              placeholder="Name or email"
              value={filters.q}
              onChange={(e) => filter("q", e.target.value)}
            />
          </label>
          <label>
            Workspace
            <select
              className="database-filter-select database-workspace-select"
              aria-label="Workspace"
              value={filters.workspace}
              onChange={(e) => filter("workspace", e.target.value)}
            >
              <option value="">All workspaces</option>
              {data?.options.workspaces.map((workspace) => (
                <option key={workspace} value={workspace}>
                  {workspace}
                </option>
              ))}
            </select>
          </label>
          <label>
            Email
            <select
              className="database-filter-select database-email-select"
              aria-label="Email"
              value={filters.email}
              onChange={(e) => filter("email", e.target.value)}
            >
              <option value="">All emails</option>
              {data?.options.emails.map((email) => (
                <option key={email} value={email}>
                  {email}
                </option>
              ))}
            </select>
          </label>
          <label>
            Database type
            <select
              className="database-filter-select database-type-select"
              aria-label="Database type"
              value={filters.type}
              onChange={(e) => filter("type", e.target.value)}
            >
              <option value="">All types</option>
              {Object.entries(types).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label>
            Status
            <select
              className="database-filter-select"
              value={filters.status}
              onChange={(e) => filter("status", e.target.value)}
            >
              <option value="">All statuses</option>
              {["Active", "Blocked", "Disconnected"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            Created from (UTC)
            <input
              type="date"
              value={filters.from}
              max={filters.until}
              onChange={(e) => filter("from", e.target.value)}
            />
          </label>
          <label>
            Created through (UTC)
            <input
              type="date"
              value={filters.until}
              min={filters.from}
              onChange={(e) => filter("until", e.target.value)}
            />
          </label>
        </div>
        {error && (
          <p role="alert" className="error-banner">
            {error}
          </p>
        )}
        <div className="table-scroll" aria-busy={loading}>
          <table className="database-table">
            <thead>
              <tr>
                {[
                  "User",
                  "Workspace",
                  "Website / project",
                  "Database type",
                  "Connection",
                  "Status",
                  "Created",
                  "Last activity",
                  "Action",
                ].map((h) => (
                  <th key={h} scope="col">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data?.rows.map((row) => (
                <tr
                  key={row.id}
                  className={row.blocked ? "database-row-blocked" : undefined}
                >
                  <td className="person database-user">
                    <strong>{row.name}</strong>
                    <small title={row.email}>{row.email}</small>
                  </td>
                  <td>
                    <span className="database-workspace" title={row.workspace}>
                      {row.workspace}
                    </span>
                  </td>
                  <td>
                    <span className="database-project" title={row.project}>
                      {row.project}
                    </span>
                  </td>
                  <td className="database-type-cell">{types[row.type]}</td>
                  <td>
                    <ConnectionStatus value={row.connection} />
                  </td>
                  <td>
                    <span
                      className={
                        "badge badge-" +
                        (row.blocked ? "blocked" : row.status.toLowerCase())
                      }
                    >
                      {row.status}
                    </span>
                  </td>
                  <td>
                    <DatabaseDate value={row.created} />
                  </td>
                  <td>
                    <DatabaseDate value={row.activity} />
                  </td>
                  <td>
                    {row.type === "sample" ? (
                      <span className="database-empty">—</span>
                    ) : (
                      <button
                        className={`button database-action ${row.blocked ? "unblock" : "block"}`}
                        disabled={loading}
                        onClick={() => {
                          setReason("");
                          setActionError("");
                          setTarget(row);
                        }}
                      >
                        {row.blocked ? "Unblock" : "Block"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="table-footer">
          <span role="status">
            {loading
              ? "Loading databases…"
              : data?.matched
                ? data.matched + " matching projects"
                : error
                  ? ""
                  : "No matching projects"}
          </span>
          <div>
            <button
              className="button"
              disabled={page === 1 || loading}
              onClick={() => setPage((n) => n - 1)}
            >
              Previous
            </button>{" "}
            <button
              className="button"
              disabled={
                loading || page * DATABASE_PAGE_SIZE >= (data?.matched || 0)
              }
              onClick={() => setPage((n) => n + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </section>
      <ActionHistory refresh={refresh + revision} />
      {target && (
        <dialog
          ref={dialog}
          className="database-confirm"
          aria-labelledby="database-confirm-title"
          onCancel={(e) => {
            if (saving) e.preventDefault();
            else setTarget(null);
          }}
        >
          <form onSubmit={confirm}>
            <h2 id="database-confirm-title">
              {target.blocked ? "Unblock" : "Block"} database access?
            </h2>
            <p>
              {target.project} ({target.email}) will{" "}
              {target.blocked ? "regain" : "lose"} access to its{" "}
              {types[target.type]} through Horizon.
            </p>
            <label>
              Reason
              <textarea
                required
                maxLength={500}
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            {actionError && <p role="alert">{actionError}</p>}
            <div className="confirmation-actions">
              <button
                type="button"
                className="button"
                disabled={saving}
                onClick={() => setTarget(null)}
              >
                Cancel
              </button>
              <button
                className="button primary"
                disabled={saving || !reason.trim()}
              >
                {saving
                  ? "Saving…"
                  : target.blocked
                    ? "Confirm unblock"
                    : "Confirm block"}
              </button>
            </div>
          </form>
        </dialog>
      )}
    </div>
  );
}
