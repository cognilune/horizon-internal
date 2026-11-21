import { randomUUID } from "node:crypto";
import { audit, requireAdmin, sameOrigin } from "@/lib/auth";
import { apiError, getDb, json, PublicError } from "@/lib/db";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function validEmail(value: unknown): value is string {
  return typeof value === "string" && value.length <= 254 && emailPattern.test(value);
}

export async function GET() {
  try {
    await requireAdmin();
    const users = await getDb(false)<{
      id: string; name: string; email: string; status: string; googleLinked: boolean;
      lastLoginAt: string | null; createdAt: string;
    }[]>`SELECT u.id,u.name,u.email,
      CASE WHEN u.status='active' THEN a.status ELSE 'suspended' END status,
      (u.google_subject IS NOT NULL) "googleLinked",u.last_login_at::text "lastLoginAt",
      a.created_at::text "createdAt"
      FROM internal_admin_access a JOIN users u ON u.id=a.user_id
      ORDER BY (a.status='active' AND u.status='active') DESC,u.name,u.email`;
    return json({ users });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const actor = await requireAdmin();
    if (Number(request.headers.get("content-length") || 0) > 4096)
      throw new PublicError("Invalid internal-user request.", 422);
    const body = await request.json();
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    if (
      name.length < 2 ||
      name.length > 120 ||
      !validEmail(email)
    )
      throw new PublicError("Enter a valid name and email address.", 422);
    const db = getDb(false);
    const [user] = await db.begin(async (tx) => {
      const existing = await tx<{ id: string; role: string }[]>`SELECT id,role FROM users WHERE lower(email)=${email} FOR UPDATE`;
      const [account] = existing[0]
        ? await tx<{ id: string; name: string; email: string }[]>`
            SELECT id,name,email FROM users WHERE id=${existing[0].id}`
        : await tx<{ id: string; name: string; email: string }[]>`
          INSERT INTO users(id,name,email,role,status,password_hash)
          VALUES(${randomUUID()},${name},${email},'admin','active',NULL)
          RETURNING id,name,email`;
      const [access] = await tx<{ status: string }[]>`
        INSERT INTO internal_admin_access(user_id,status,granted_by)
        VALUES(${account.id},'active',${actor.userId})
        ON CONFLICT(user_id) DO UPDATE SET
          status='active',granted_by=${actor.userId},updated_at=NOW()
        RETURNING status`;
      return [{ ...account, status: access.status }];
    });
    await audit(actor.userId, "admin.internal_user_approved", { userId: user.id });
    return json({ user }, 201);
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    sameOrigin(request);
    const actor = await requireAdmin();
    if (Number(request.headers.get("content-length") || 0) > 4096)
      throw new PublicError("Invalid internal-user update.", 422);
    const body = await request.json();
    if (!body || typeof body.userId !== "string" || !body.userId)
      throw new PublicError("Choose a valid internal user.", 422);
    const nextStatus = body.status;
    const hasProfile = typeof body.name === "string" || typeof body.email === "string";
    const name = hasProfile && typeof body.name === "string" ? body.name.trim() : "";
    const email = hasProfile && typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (hasProfile && (name.length < 2 || name.length > 120 || !validEmail(email)))
      throw new PublicError("Enter a valid name and email address.", 422);
    if (!hasProfile && !["active", "suspended"].includes(nextStatus))
      throw new PublicError("Choose a valid update.", 422);
    const db = getDb(false);
    const result = await db.begin(async (tx) => {
      const [user] = await tx<{ id: string; email: string; status: string }[]>`
        SELECT u.id,u.email,a.status FROM users u
        JOIN internal_admin_access a ON a.user_id=u.id
        WHERE u.id=${body.userId} FOR UPDATE OF u,a`;
      if (!user) throw new PublicError("Internal user not found.", 404);
      if (hasProfile) {
        const [duplicate] = await tx<{ id: string }[]>`SELECT id FROM users WHERE lower(email)=${email} AND id<>${user.id} LIMIT 1`;
        if (duplicate) throw new PublicError("That email address is already in use.", 409);
      }
      if (nextStatus === "suspended" && user.id === actor.userId)
        throw new PublicError("You cannot suspend your own account.", 409);
      if (nextStatus === "suspended") {
        const [count] = await tx<{ total: number }[]>`
          SELECT COUNT(*)::int total FROM internal_admin_access a
          JOIN users u ON u.id=a.user_id
          WHERE a.status='active' AND u.status='active'`;
        if (count.total <= 1) throw new PublicError("At least one active internal administrator is required.", 409);
      }
      const [updated] = await tx<{ id: string; name: string; email: string; status: string }[]>`
        UPDATE users SET
          name=COALESCE(${hasProfile ? name : null},name),
          google_subject=CASE WHEN ${hasProfile ? email : null} IS NOT NULL AND lower(email)<>${hasProfile ? email : null} THEN NULL ELSE google_subject END,
          email_verified_at=CASE WHEN ${hasProfile ? email : null} IS NOT NULL AND lower(email)<>${hasProfile ? email : null} THEN NULL ELSE email_verified_at END,
          email=COALESCE(${hasProfile ? email : null},email),
          updated_at=NOW()
        WHERE id=${user.id} RETURNING id,name,email,status`;
      const [access] = await tx<{ status: string }[]>`
        UPDATE internal_admin_access SET
          status=COALESCE(${["active", "suspended"].includes(nextStatus) ? nextStatus : null},status),
          updated_at=NOW()
        WHERE user_id=${user.id} RETURNING status`;
      return { ...updated, status: access.status };
    });
    await audit(actor.userId, "admin.internal_user_updated", { userId: result.id, status: result.status, profileUpdated: String(hasProfile) });
    return json({ user: result });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    sameOrigin(request);
    const actor = await requireAdmin();
    if (Number(request.headers.get("content-length") || 0) > 1024)
      throw new PublicError("Invalid internal-user deletion.", 422);
    const body = await request.json();
    if (!body || typeof body.userId !== "string" || !body.userId)
      throw new PublicError("Choose a valid internal user.", 422);
    if (body.userId === actor.userId)
      throw new PublicError("You cannot delete your own account.", 409);
    const db = getDb(false);
    const deleted = await db.begin(async (tx) => {
      const [user] = await tx<{ id: string; email: string; status: string; role: string }[]>`
        SELECT u.id,u.email,a.status,u.role FROM users u
        JOIN internal_admin_access a ON a.user_id=u.id
        WHERE u.id=${body.userId} FOR UPDATE OF u,a`;
      if (!user) throw new PublicError("Internal user not found.", 404);
      if (user.status === "active") {
        const [count] = await tx<{ total: number }[]>`
          SELECT COUNT(*)::int total FROM users
          JOIN internal_admin_access a ON a.user_id=users.id
          WHERE a.status='active' AND users.status='active'`;
        if (count.total <= 1)
          throw new PublicError("At least one active internal administrator is required.", 409);
      }
      await tx`DELETE FROM internal_admin_access WHERE user_id=${user.id}`;
      if (user.role === "admin")
        await tx`UPDATE users SET
          role='viewer',status='suspended',password_hash=NULL,
          google_subject=NULL,updated_at=NOW()
          WHERE id=${user.id}`;
      return { id: user.id, email: user.email };
    });
    await audit(actor.userId, "admin.internal_user_deleted", { userId: deleted.id });
    return json({ deleted });
  } catch (error) {
    return apiError(error);
  }
}
