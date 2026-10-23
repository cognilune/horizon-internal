"use client";
import { useEffect, useRef, useState } from "react";
import DataTable, { Badge, Cell, columns } from "./DataTable";
import { Icon } from "./Icon";
import { type DataRow } from "./Charts";
export default function DetailDrawer({
  target,
  params,
  onClose,
  onOpen,
  onNavigate,
}: {
  target: { resource: string; id: string };
  params: string;
  onClose: () => void;
  onOpen: (resource: string, id: string) => void;
  onNavigate: (section: string, key: string, id: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    [record, setRecord] = useState<DataRow | null>(null),
    [error, setError] = useState(""),
    [tab, setTab] = useState("profile");
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  useEffect(() => {
    setRecord(null);
    setError("");
    setTab("profile");
    const abort = new AbortController(),
      p = new URLSearchParams(params);
    p.set("view", "detail");
    p.set("resource", target.resource);
    p.set("id", target.id);
    fetch(`/api/admin?${p}`, { signal: abort.signal })
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error);
        setRecord(body.record);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => abort.abort();
  }, [target, params]);
  const scope = new URLSearchParams(params);
  ["q", "status", "activity", "user", "workspace", "project", "plan"].forEach(
    (k) => scope.delete(k),
  );
  scope.set("allDates", "true");
  const scopeKey =
    target.resource === "users"
      ? "user"
      : target.resource === "projects"
        ? "project"
        : "workspace";
  if (target.resource !== "payments") scope.set(scopeKey, target.id);
  if (target.resource === "subscriptions") {
    scope.delete("workspace");
    if (record?.source === "account") scope.set("user", String(record.user_id));
    else scope.set("workspace", target.id);
  }
  const tabs =
    target.resource === "users"
      ? [
          "profile",
          "subscriptions",
          "credits",
          "workspaces",
          "projects",
          "payments",
          "invitations",
        ]
      : target.resource === "workspaces"
        ? [
            "profile",
            "members",
            "projects",
            "credits",
            "payments",
            "invitations",
          ]
        : target.resource === "projects"
          ? ["profile", "credits"]
          : target.resource === "subscriptions"
            ? ["profile", "payments", "credits"]
            : ["profile"];
  return (
    <dialog
      ref={dialog}
      className="detail-dialog"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === dialog.current) onClose();
      }}
    >
      <div className="drawer-body">
        <div className="drawer-heading">
          <span className="eyebrow">{target.resource} / RECORD DETAILS</span>
          <button
            className="icon-button"
            aria-label="Close details"
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </div>
        {error ? (
          <div className="error-banner" role="alert">
            {error}
          </div>
        ) : !record ? (
          <div className="table-skeleton">
            <div />
            <div />
            <div />
          </div>
        ) : (
          <>
            <div className="profile-heading">
              <span className="profile-icon">
                <Icon name={target.resource} size={28} />
              </span>
              <h2>{String(record.name || record.user || record.id)}</h2>
              <p>{String(record.email || record.workspace || record.id)}</p>
              {record.status !== undefined && <Badge value={record.status} />}
            </div>
            <div className="tabs" role="tablist" aria-label="Record sections">
              {tabs.map((t) => (
                <button
                  key={t}
                  role="tab"
                  aria-selected={tab === t}
                  onClick={() => setTab(t)}
                  className={tab === t ? "selected" : ""}
                >
                  {t === "profile"
                    ? "Details"
                    : t === "credits"
                      ? "Usage & activity"
                      : t === "subscriptions"
                        ? "Subscriptions"
                        : t[0].toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
            <div role="tabpanel">
              {tab === "profile" ? (
                <>
                  <dl className="detail-fields">
                    {columns[target.resource].map((col) => (
                      <div key={col.key}>
                        <dt>{col.label}</dt>
                        <dd>
                          <Cell
                            row={record}
                            column={{
                              ...col,
                              type:
                                col.type === "person" ? undefined : col.type,
                            }}
                          />
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <div className="detail-links">
                    {record.user_id && target.resource !== "users" ? (
                      <button
                        className="button"
                        onClick={() => onOpen("users", String(record.user_id))}
                      >
                        <Icon name="users" size={16} />
                        Open owner
                      </button>
                    ) : null}
                    {record.workspace_id && target.resource !== "workspaces" ? (
                      <button
                        className="button"
                        onClick={() =>
                          onOpen("workspaces", String(record.workspace_id))
                        }
                      >
                        <Icon name="workspaces" size={16} />
                        Open workspace
                      </button>
                    ) : null}
                    {target.resource !== "payments" && (
                      <button
                        className="button"
                        onClick={() =>
                          onNavigate("credits", scopeKey, target.id)
                        }
                      >
                        <Icon name="credits" size={16} />
                        Explore credit operations
                      </button>
                    )}
                  </div>
                  {target.resource === "projects" && (
                    <p className="data-note">
                      Activity includes creation, the latest update and recorded
                      credit operations. A complete project event stream is not
                      available.
                    </p>
                  )}
                  {target.resource === "users" && (
                    <p className="data-note">
                      Balances and allowances belong to owned workspaces. Shared
                      member limits are shown in workspace membership records.
                      Payment history includes confirmed purchases; it is not a
                      complete plan-change history.
                    </p>
                  )}
                </>
              ) : (
                <DataTable
                  key={tab}
                  resource={tab}
                  params={scope.toString()}
                  onOpen={onOpen}
                  title={tab === "credits" ? "Recorded activity" : undefined}
                />
              )}
            </div>
          </>
        )}
      </div>
    </dialog>
  );
}
