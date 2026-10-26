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
    [tab, setTab] = useState("profile"),
    [statusAction, setStatusAction] = useState<
      "block" | "unblock" | "activate" | "deactivate" | "delete" | "restore" | null
    >(null),
    [statusBusy, setStatusBusy] = useState(false),
    [statusError, setStatusError] = useState("");
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  useEffect(() => {
    setRecord(null);
    setError("");
    setStatusError("");
    setStatusAction(null);
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
  async function updateRecordStatus() {
    if (!statusAction) return;
    const workspaceAction = target.resource === "workspaces";
    const projectAction = target.resource === "projects";
    setStatusBusy(true);
    setStatusError("");
    try {
      const requestBody = JSON.stringify(
        workspaceAction
          ? { resource: "workspace", workspaceId: target.id, action: statusAction }
          : projectAction
            ? { resource: "project", projectId: target.id, action: statusAction }
            : {
                userId:
                  target.resource === "projects"
                    ? String(record?.user_id || "")
                    : target.id,
                action: statusAction,
              },
      );
      let response = await fetch("/api/admin", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: requestBody,
      });
      if (response.status === 503)
        response = await fetch("/api/admin", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: requestBody,
        });
      const body = (await response.json()) as {
        error?: string;
        user?: { status?: string };
        workspace?: { status?: string };
        project?: { status?: string; blocked?: boolean };
      };
      const status = workspaceAction
        ? body.workspace?.status
        : projectAction
          ? body.project?.status
          : body.user?.status;
      if (!response.ok || !status)
        throw new Error(body.error || "The status could not be updated.");
      setRecord((current) =>
        current
          ? projectAction && ["block", "unblock"].includes(statusAction)
            ? { ...current, website_blocked: Boolean(body.project?.blocked) }
            : { ...current, status }
          : current,
      );
      setStatusAction(null);
    } catch (reason) {
      setStatusError(
        reason instanceof Error
          ? reason.message
          : "The status could not be updated.",
      );
    } finally {
      setStatusBusy(false);
    }
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
            <div className={`profile-heading ${target.resource === "projects" ? "project-profile-heading" : ""}`}>
              <span className="profile-icon">
                <Icon name={target.resource} size={28} />
              </span>
              <h2 title={String(record.name || record.user || record.id)}>
                {String(record.name || record.user || record.id)}
              </h2>
              <p>{String(record.email || record.workspace || record.id)}</p>
              {record.status !== undefined && <Badge value={record.status} />}
              {target.resource === "users" && (
                <button
                  type="button"
                  className={`button user-status-action ${record.status === "blocked" ? "unblock" : "block"}`}
                  onClick={() =>
                    setStatusAction(
                      record.status === "blocked" ? "unblock" : "block",
                    )
                  }
                >
                  <Icon
                    name={
                      record.status === "blocked"
                        ? "user-unblock"
                        : "user-block"
                    }
                    size={15}
                  />
                  {record.status === "blocked" ? "Unblock user" : "Block user"}
                </button>
              )}
              {target.resource === "workspaces" &&
                ["active", "suspended"].includes(String(record.status)) && (
                  <button
                    type="button"
                    className={`button user-status-action workspace-status-action ${record.status === "active" ? "block" : "unblock"}`}
                    onClick={() =>
                      setStatusAction(
                        record.status === "active" ? "deactivate" : "activate",
                      )
                    }
                  >
                    <Icon name="workspaces" size={15} />
                    {record.status === "active"
                      ? "Deactivate workspace"
                      : "Activate workspace"}
                  </button>
                )}
              {target.resource === "projects" && (
                <div className="project-record-actions">
                  <button
                    type="button"
                    className={`button user-status-action ${record.status === "deleted" ? "unblock" : "block"}`}
                    onClick={() =>
                      setStatusAction(
                        record.status === "deleted" ? "restore" : "delete",
                      )
                    }
                  >
                    <Icon name={record.status === "deleted" ? "refresh" : "trash"} size={15} />
                    {record.status === "deleted" ? "Restore project" : "Delete project"}
                  </button>
                  <button
                    type="button"
                    className={`button user-status-action ${record.website_blocked ? "unblock" : "block"}`}
                    onClick={() =>
                      setStatusAction(
                        record.website_blocked ? "unblock" : "block",
                      )
                    }
                  >
                    <Icon name={record.website_blocked ? "user-unblock" : "user-block"} size={15} />
                    {record.website_blocked ? "Unblock website" : "Block website"}
                  </button>
                </div>
              )}
            </div>
            {statusError && (
              <div className="error-banner" role="alert">
                <Icon name="info" size={17} /> {statusError}
              </div>
            )}
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
      {statusAction && record && (
        <div className="confirmation-backdrop user-status-confirmation">
          <section
            className="confirmation-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="record-status-title"
            aria-describedby="record-status-description"
          >
            <span className="confirmation-icon" aria-hidden="true">
              <Icon
                name={
                  statusAction === "delete"
                    ? "trash"
                    : statusAction === "restore"
                      ? "refresh"
                      : statusAction === "block" || statusAction === "deactivate"
                    ? "user-block"
                    : "user-unblock"
                }
                size={22}
              />
            </span>
            <h2 id="record-status-title">
              {statusAction === "block"
                ? target.resource === "projects"
                  ? "Block this website?"
                  : "Block this user?"
                : statusAction === "unblock"
                  ? target.resource === "projects"
                    ? "Unblock this website?"
                    : "Unblock this user?"
                  : statusAction === "delete"
                    ? "Delete this project?"
                    : statusAction === "restore"
                      ? "Restore this project?"
                  : statusAction === "deactivate"
                    ? "Deactivate this workspace?"
                    : "Activate this workspace?"}
            </h2>
            <p id="record-status-description">
              {statusAction === "block"
                ? target.resource === "projects"
                  ? `${String(record.name || "This website")} will become unavailable on public, custom-domain, and preview links until it is unblocked.`
                  : `${String(record.name || record.email || "This user")} will be signed out immediately and will not be able to log in or access protected Horizon features.`
                : statusAction === "unblock"
                  ? target.resource === "projects"
                    ? `${String(record.name || "This website")} will become available through its preview and published links again.`
                    : `${String(record.name || record.email || "This user")} will be able to sign in to Horizon again. Previously revoked sessions will remain closed.`
                  : statusAction === "delete"
                    ? `${String(record.name || "This project")} will move to the recycle bin and will no longer be available to its owner.`
                    : statusAction === "restore"
                      ? `${String(record.name || "This project")} will be restored and available to its owner again.`
                  : statusAction === "deactivate"
                    ? `${String(record.name || "This workspace")} will be suspended immediately. Its owner and every member will lose access, existing workspace selections will stop working, and pending invitations cannot be accepted until it is activated again.`
                    : `${String(record.name || "This workspace")} will become available to its owner and members again.`}
            </p>
            <div className="confirmation-actions">
              <button
                type="button"
                className="button"
                autoFocus
                disabled={statusBusy}
                onClick={() => setStatusAction(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`button primary ${statusAction === "block" || statusAction === "deactivate" || statusAction === "delete" ? "danger" : ""}`}
                disabled={statusBusy}
                onClick={updateRecordStatus}
              >
                {statusBusy
                  ? statusAction === "block"
                    ? "Blocking…"
                    : statusAction === "unblock"
                      ? "Unblocking…"
                      : statusAction === "delete"
                        ? "Deleting…"
                        : statusAction === "restore"
                          ? "Restoring…"
                      : statusAction === "deactivate"
                        ? "Deactivating…"
                        : "Activating…"
                  : statusAction === "block"
                    ? target.resource === "projects"
                      ? "Block website"
                      : "Block user"
                    : statusAction === "unblock"
                      ? target.resource === "projects"
                        ? "Unblock website"
                        : "Unblock user"
                      : statusAction === "delete"
                        ? "Delete project"
                        : statusAction === "restore"
                          ? "Restore project"
                      : statusAction === "deactivate"
                        ? "Deactivate workspace"
                        : "Activate workspace"}
              </button>
            </div>
          </section>
        </div>
      )}
    </dialog>
  );
}
