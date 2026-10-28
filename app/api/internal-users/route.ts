import { randomUUID } from "node:crypto";
import { audit, hashPassword, requireAdmin, sameOrigin } from "@/lib/auth";
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
    }[]>`SELECT id,name,email,status,(google_subject IS NOT NULL) "googleLinked",last_login_at::text "lastLoginAt",created_at::text "createdAt" FROM users WHERE role='admin' ORDER BY status='active' DESC,name,email`;
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
      !validEmail(email) ||
      typeof body?.password !== "string" ||
      typeof body?.confirmPassword !== "string"
    )
      throw new PublicError("Enter a valid name and email address.", 422);
    if (body.password !== body.confirmPassword)
      throw new PublicError("Password and confirm password must match.", 422);
    const passwordHash = await hashPassword(body?.password);
    const db = getDb(false);
    const [user] = await db.begin(async (tx) => {
      const existing = await tx<{ id: string; role: string }[]>`SELECT id,role FROM users WHERE lower(email)=${email} FOR UPDATE`;
      if (existing[0] && existing[0].role === "customer")
        throw new PublicError("That email belongs to a customer account and cannot be converted here.", 409);
      if (existing[0])
        return tx<{ id: string; name: string; email: string; status: string }[]>`
          UPDATE users SET name=${name},email=${email},role='admin',status='active',password_hash=${passwordHash},email_verified_at=COALESCE(email_verified_at,NOW()),updated_at=NOW()
          WHERE id=${existing[0].id} RETURNING id,name,email,status`;
      return tx<{ id: string; name: string; email: string; status: string }[]>`
          INSERT INTO users(id,name,email,role,status,password_hash,email_verified_at)
          VALUES(${randomUUID()},${name},${email},'admin','active',${passwordHash},NOW())
          RETURNING id,name,email,status`;
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
    const hasPassword = typeof body.password === "string" && body.password.length > 0;
    const hasProfile = typeof body.name === "string" || typeof body.email === "string";
    const name = hasProfile && typeof body.name === "string" ? body.name.trim() : "";
    const email = hasProfile && typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (hasProfile && (name.length < 2 || name.length > 120 || !validEmail(email)))
      throw new PublicError("Enter a valid name and email address.", 422);
    if (!hasPassword && !hasProfile && !["active", "suspended"].includes(nextStatus))
      throw new PublicError("Choose a valid update.", 422);
    const passwordHash = hasPassword ? await hashPassword(body.password) : null;
    const db = getDb(false);
    const result = await db.begin(async (tx) => {
      const [user] = await tx<{ id: string; email: string; status: string }[]>`SELECT id,email,status FROM users WHERE id=${body.userId} AND role='admin' FOR UPDATE`;
      if (!user) throw new PublicError("Internal user not found.", 404);
      if (hasProfile) {
        const [duplicate] = await tx<{ id: string }[]>`SELECT id FROM users WHERE lower(email)=${email} AND id<>${user.id} LIMIT 1`;
        if (duplicate) throw new PublicError("That email address is already in use.", 409);
      }
      if (nextStatus === "suspended" && user.id === actor.userId)
        throw new PublicError("You cannot suspend your own account.", 409);
      if (nextStatus === "suspended") {
        const [count] = await tx<{ total: number }[]>`SELECT COUNT(*)::int total FROM users WHERE role='admin' AND status='active'`;
        if (count.total <= 1) throw new PublicError("At least one active internal administrator is required.", 409);
      }
      const [updated] = await tx<{ id: string; name: string; email: string; status: string }[]>`
        UPDATE users SET
          name=COALESCE(${hasProfile ? name : null},name),
          google_subject=CASE WHEN ${hasProfile ? email : null} IS NOT NULL AND lower(email)<>${hasProfile ? email : null} THEN NULL ELSE google_subject END,
          email=COALESCE(${hasProfile ? email : null},email),
          status=COALESCE(${["active", "suspended"].includes(nextStatus) ? nextStatus : null},status),
          password_hash=COALESCE(${passwordHash},password_hash),updated_at=NOW()
        WHERE id=${user.id} RETURNING id,name,email,status`;
      return updated;
    });
    await audit(actor.userId, "admin.internal_user_updated", { userId: result.id, status: result.status, profileUpdated: String(hasProfile), passwordUpdated: String(hasPassword) });
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
      const [user] = await tx<{ id: string; email: string; status: string }[]>`
        SELECT id,email,status FROM users
        WHERE id=${body.userId} AND role='admin' FOR UPDATE`;
      if (!user) throw new PublicError("Internal user not found.", 404);
      if (user.status === "active") {
        const [count] = await tx<{ total: number }[]>`
          SELECT COUNT(*)::int total FROM users
          WHERE role='admin' AND status='active'`;
        if (count.total <= 1)
          throw new PublicError("At least one active internal administrator is required.", 409);
      }
      const [removed] = await tx<{ id: string; email: string }[]>`
        UPDATE users SET
          role='viewer',status='suspended',password_hash=NULL,
          google_subject=NULL,updated_at=NOW()
        WHERE id=${user.id} AND role='admin'
        RETURNING id,email`;
      return removed;
    });
    await audit(actor.userId, "admin.internal_user_deleted", { userId: deleted.id });
    return json({ deleted });
  } catch (error) {
    return apiError(error);
  }
}
