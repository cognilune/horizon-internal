"use client";
import { useCallback, useEffect, useState } from "react";
import { Icon } from "./Icon";

type InternalUser = {
  id: string; name: string; email: string; status: string; googleLinked: boolean;
  lastLoginAt: string | null; createdAt: string;
};

export default function InternalUsers({
  currentEmail,
  addOpen,
  onCloseAdd,
}: {
  currentEmail: string;
  addOpen: boolean;
  onCloseAdd: () => void;
}) {
  const [users, setUsers] = useState<InternalUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirm, setConfirm] = useState<InternalUser | null>(null);
  const [editing, setEditing] = useState<InternalUser | null>(null);
  const [deleting, setDeleting] = useState<InternalUser | null>(null);
  const [actionUserId, setActionUserId] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [showEditConfirmPassword, setShowEditConfirmPassword] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/internal-users", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to load internal users.");
      setUsers(body.users);
    } catch (reason) { setError((reason as Error).message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 4000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  async function addUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      if (data.get("password") !== data.get("confirmPassword"))
        throw new Error("Password and confirm password must match.");
      const response = await fetch("/api/internal-users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: data.get("name"), email: data.get("email"), password: data.get("password"), confirmPassword: data.get("confirmPassword") }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to approve this user.");
      form.reset(); setShowPassword(false); setShowConfirmPassword(false); setNotice(`${body.user.email} can now sign in with their password or matching Google account.`); onCloseAdd(); await load();
    } catch (reason) { setError((reason as Error).message); }
    finally { setSaving(false); }
  }

  async function updateUser(user: InternalUser, status: "active" | "suspended") {
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/internal-users", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: user.id, status }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to update this user.");
      setNotice(`${user.email} is now ${status === "active" ? "active" : "inactive"}.`); setConfirm(null); await load();
    } catch (reason) { setError((reason as Error).message); }
    finally { setSaving(false); }
  }

  async function editUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    setSaving(true); setError(""); setNotice("");
    const data = new FormData(event.currentTarget);
    try {
      if (data.get("password") !== data.get("confirmPassword"))
        throw new Error("Password and confirm password must match.");
      const response = await fetch("/api/internal-users", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: editing.id, name: data.get("name"), email: data.get("email"), password: data.get("password") }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to update this user.");
      setNotice(`${body.user.email} was updated.`); setEditing(null); setShowEditPassword(false); setShowEditConfirmPassword(false); await load();
    } catch (reason) { setError((reason as Error).message); }
    finally { setSaving(false); }
  }

  async function deleteUser(user: InternalUser) {
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/internal-users", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: user.id }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to delete this user.");
      setNotice(`${user.email} was deleted from internal users.`); setDeleting(null); await load();
    } catch (reason) { setError((reason as Error).message); setDeleting(null); }
    finally { setSaving(false); }
  }

  const filteredUsers = users.filter((user) =>
    statusFilter === "all" ? true : statusFilter === "active" ? user.status === "active" : user.status !== "active",
  );
  const activeCount = users.filter((user) => user.status === "active").length;
  const inactiveCount = users.length - activeCount;
  const filterOptions = [
    { value: "all" as const, label: "All users", count: users.length },
    { value: "active" as const, label: "Active users", count: activeCount },
    { value: "inactive" as const, label: "Inactive users", count: inactiveCount },
  ];
  const selectedFilter = filterOptions.find((option) => option.value === statusFilter)!;

  return <div className="internal-users-layout">
    <div
      className="internal-user-filter-select"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFilterOpen(false);
      }}
    >
      <button
        type="button"
        className="internal-user-filter-trigger"
        aria-label="Filter internal users by status"
        aria-haspopup="listbox"
        aria-expanded={filterOpen}
        onClick={() => setFilterOpen((open) => !open)}
      >
        <span>{selectedFilter.label}</span>
        <strong>{selectedFilter.count}</strong>
        <Icon name="down" size={14} />
      </button>
      {filterOpen && <div className="internal-user-filter-menu" role="listbox" aria-label="Internal user status">
        {filterOptions.map((option) => <button
          type="button"
          role="option"
          aria-selected={statusFilter === option.value}
          className={statusFilter === option.value ? "selected" : ""}
          key={option.value}
          onClick={() => {
            setStatusFilter(option.value);
            setFilterOpen(false);
          }}
        >
          <span>{option.label}</span>
          <strong>{option.count}</strong>
          {statusFilter === option.value && <i aria-hidden="true">✓</i>}
        </button>)}
      </div>}
    </div>
    <section className="panel internal-user-list-panel">
      <div className="panel-heading"><div><h2>Internal users</h2><p>{activeCount} active · {users.length} total</p></div></div>
      {error && <div className="error-banner" role="alert">{error}</div>}
      {notice && <div className="success-banner" role="status">{notice}</div>}
      {loading ? <p className="internal-empty">Loading authorized users…</p> : users.length === 0 ? <p className="internal-empty">No internal users found.</p> : filteredUsers.length === 0 ? <p className="internal-empty">No {statusFilter} internal users found.</p> : <div className="internal-user-list">{filteredUsers.map((user) => <article className="internal-user-row" key={user.id}>
        <span className="avatar purple">{user.name.split(" ").map((part) => part[0]).slice(0,2).join("")}</span>
        <div className="internal-user-identity"><strong>{user.name}{user.email.toLowerCase() === currentEmail.toLowerCase() ? " (you)" : ""}</strong><span>{user.email}</span><small>{user.googleLinked ? "Google linked" : "Google available after first matching sign-in"} · {user.lastLoginAt ? `Last login ${new Date(user.lastLoginAt).toLocaleString()}` : "Never signed in"}</small></div>
        <div className="internal-user-actions"><button
          type="button"
          className={`internal-status-toggle ${user.status === "active" ? "active" : "inactive"}`}
          role="switch"
          aria-checked={user.status === "active"}
          aria-label={`${user.status === "active" ? "Deactivate" : "Activate"} ${user.name}`}
          disabled={saving || user.email.toLowerCase() === currentEmail.toLowerCase()}
          onClick={() => setConfirm(user)}
        >
          <span className="status-toggle-track" aria-hidden="true"><i /></span>
          <span>{user.status === "active" ? "Active" : "Inactive"}</span>
        </button><div
          className="internal-user-action-menu"
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setActionUserId(null);
          }}
        >
          <button
            type="button"
            className="icon-button internal-more-button"
            aria-label={`Actions for ${user.name}`}
            aria-haspopup="menu"
            aria-expanded={actionUserId === user.id}
            disabled={saving}
            onClick={() => setActionUserId((current) => current === user.id ? null : user.id)}
          >
            <Icon name="more" size={19} />
          </button>
          {actionUserId === user.id && <div className="internal-user-action-popover" role="menu">
            <button type="button" role="menuitem" onClick={() => { setError(""); setActionUserId(null); setEditing(user); }}>
              <Icon name="edit" size={17} /><span><strong>Edit user</strong><small>Name, email, or password</small></span>
            </button>
            <button type="button" role="menuitem" className="delete" disabled={user.email.toLowerCase() === currentEmail.toLowerCase()} onClick={() => { setActionUserId(null); setDeleting(user); }}>
              <Icon name="trash" size={17} /><span><strong>Delete user</strong><small>{user.email.toLowerCase() === currentEmail.toLowerCase() ? "You cannot delete yourself" : "Permanently remove access"}</small></span>
            </button>
          </div>}
        </div></div>
      </article>)}</div>}
    </section>
    {addOpen && <div className="confirmation-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onCloseAdd(); }}><section className="confirmation-dialog add-user-dialog" role="dialog" aria-modal="true" aria-labelledby="add-user-title">
      <button type="button" className="icon-button dialog-close" aria-label="Close add user" onClick={onCloseAdd} disabled={saving}><Icon name="close" size={18}/></button>
      <div className="panel-heading"><div><h2 id="add-user-title">Approve an internal user</h2><p>Add the exact email they must use for Google sign-in.</p></div><span className="internal-lock"><Icon name="lock" size={18}/></span></div>
      <form className="internal-user-form" onSubmit={addUser}>
        <label>Full name<input name="name" autoComplete="name" minLength={2} maxLength={120} required placeholder="Full name" autoFocus /></label>
        <label>Email address<input name="email" type="email" autoComplete="email" maxLength={254} required placeholder="name@company.com" /></label>
        <label>Password<span className="password-field"><input name="password" type={showPassword ? "text" : "password"} autoComplete="new-password" minLength={12} maxLength={128} required placeholder="At least 12 characters" /><button type="button" className="password-toggle" aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} onClick={() => setShowPassword((visible) => !visible)}><Icon name={showPassword ? "eye-off" : "eye"} size={18} /></button></span></label>
        <label>Confirm password<span className="password-field"><input name="confirmPassword" type={showConfirmPassword ? "text" : "password"} autoComplete="new-password" minLength={12} maxLength={128} required placeholder="Enter password again" /><button type="button" className="password-toggle" aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"} aria-pressed={showConfirmPassword} onClick={() => setShowConfirmPassword((visible) => !visible)}><Icon name={showConfirmPassword ? "eye-off" : "eye"} size={18} /></button></span></label>
        {error && <div className="error-banner" role="alert">{error}</div>}
        <p className="form-help">Only active users listed here can access Horizon Internal. Google must return this exact email.</p>
        <div className="confirmation-actions"><button type="button" className="button" onClick={onCloseAdd} disabled={saving}>Cancel</button><button className="button primary" disabled={saving}>{saving ? "Saving…" : "Approve user"}</button></div>
      </form>
    </section></div>}
    {editing && <div className="confirmation-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) { setEditing(null); setShowEditPassword(false); setShowEditConfirmPassword(false); } }}><section className="confirmation-dialog add-user-dialog" role="dialog" aria-modal="true" aria-labelledby="edit-user-title">
      <button type="button" className="icon-button dialog-close" aria-label="Close edit user" onClick={() => { setEditing(null); setShowEditPassword(false); setShowEditConfirmPassword(false); }} disabled={saving}><Icon name="close" size={18}/></button>
      <div className="panel-heading"><div><h2 id="edit-user-title">Edit internal user</h2><p>Update their account details and sign-in credentials.</p></div><span className="internal-lock"><Icon name="edit" size={18}/></span></div>
      <form className="internal-user-form" onSubmit={editUser}>
        <label>Full name<input name="name" autoComplete="name" minLength={2} maxLength={120} required defaultValue={editing.name} autoFocus /></label>
        <label>Email address<input name="email" type="email" autoComplete="email" maxLength={254} required defaultValue={editing.email} /></label>
        <label>New password <small>(leave blank to keep the current password)</small><span className="password-field"><input name="password" type={showEditPassword ? "text" : "password"} autoComplete="new-password" minLength={12} maxLength={128} placeholder="At least 12 characters" /><button type="button" className="password-toggle" aria-label={showEditPassword ? "Hide new password" : "Show new password"} aria-pressed={showEditPassword} onClick={() => setShowEditPassword((visible) => !visible)}><Icon name={showEditPassword ? "eye-off" : "eye"} size={18} /></button></span></label>
        <label>Confirm new password<span className="password-field"><input name="confirmPassword" type={showEditConfirmPassword ? "text" : "password"} autoComplete="new-password" minLength={12} maxLength={128} placeholder="Enter the new password again" /><button type="button" className="password-toggle" aria-label={showEditConfirmPassword ? "Hide confirm password" : "Show confirm password"} aria-pressed={showEditConfirmPassword} onClick={() => setShowEditConfirmPassword((visible) => !visible)}><Icon name={showEditConfirmPassword ? "eye-off" : "eye"} size={18} /></button></span></label>
        {error && <div className="error-banner" role="alert">{error}</div>}
        <div className="confirmation-actions"><button type="button" className="button" onClick={() => { setEditing(null); setShowEditPassword(false); setShowEditConfirmPassword(false); }} disabled={saving}>Cancel</button><button className="button primary" disabled={saving}>{saving ? "Saving…" : "Save changes"}</button></div>
      </form>
    </section></div>}
    {deleting && <div className="confirmation-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setDeleting(null); }}><section className="confirmation-dialog delete-user-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-user-title" aria-describedby="delete-user-description">
      <span className="confirmation-icon"><Icon name="trash" size={24}/></span>
      <h2 id="delete-user-title">Delete {deleting.name}?</h2>
      <p id="delete-user-description">This removes <strong>{deleting.email}</strong> from internal users, clears their sign-in credentials, and immediately ends their Horizon administrator access. Existing audit history is preserved.</p>
      <div className="confirmation-actions"><button type="button" className="button" onClick={() => setDeleting(null)} disabled={saving}>Cancel</button><button type="button" className="button danger" onClick={() => void deleteUser(deleting)} disabled={saving}>{saving ? "Deleting…" : "Delete user"}</button></div>
    </section></div>}
    {confirm && <div className="confirmation-backdrop" role="presentation"><section className="confirmation-dialog" role="dialog" aria-modal="true" aria-labelledby="internal-confirm-title"><span className="confirmation-icon"><Icon name={confirm.status === "active" ? "user-block" : "user-unblock"} size={24}/></span><h2 id="internal-confirm-title">{confirm.status === "active" ? "Deactivate" : "Activate"} {confirm.name}?</h2><p>{confirm.status === "active" ? "They will immediately lose password and Google access to Horizon Internal." : "They will be able to sign in again with their password or matching Google account."}</p><div className="confirmation-actions"><button className="button" onClick={() => setConfirm(null)} disabled={saving}>Cancel</button><button className="button primary" onClick={() => updateUser(confirm, confirm.status === "active" ? "suspended" : "active")} disabled={saving}>{saving ? "Saving…" : confirm.status === "active" ? "Deactivate user" : "Activate user"}</button></div></section></div>}
  </div>;
}
