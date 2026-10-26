import { cookies } from "next/headers";
import {
  createHash,
  randomBytes,
  randomUUID,
  scrypt as rawScrypt,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { getDb, PublicError } from "./db";
import { authorizeSession, type Session } from "./session";
export const COOKIE = "horizon_internal_session";
const scrypt = promisify(rawScrypt);
export async function hashPassword(password: string) {
  if (password.length < 12 || password.length > 128)
    throw new PublicError("Password must contain between 12 and 128 characters.", 422);
  const salt = randomBytes(16);
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}
export async function requireAdmin(): Promise<Session> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  const session =
    token &&
    (await authorizeSession(
      token,
      process.env.ADMIN_SESSION_SECRET || "",
      async (id) => {
        const [user] =
          await getDb()`SELECT name,email,role,status FROM users WHERE id=${id}`;
        return user
          ? {
              name: String(user.name),
              email: String(user.email),
              role: String(user.role),
              status: String(user.status),
            }
          : null;
      },
    ));
  if (!session)
    throw new PublicError(
      "Sign in with your Horizon administrator account.",
      401,
    );
  return session;
}
export function sameOrigin(request: Request) {
  const expected = new URL(process.env.APP_ORIGIN || request.url).origin;
  if (request.headers.get("origin") !== expected)
    throw new PublicError(
      "This action must originate from Horizon-Internal.",
      403,
    );
}
export async function checkCredentials(email: string, password: string) {
  const db = getDb(false);
  // Email-wide limit cannot be bypassed with a spoofed forwarded IP or another app replica.
  const key = createHash("sha256")
    .update(`horizon-internal:${email.toLowerCase()}`)
    .digest("hex");
  const [limit] = await db`
    INSERT INTO admin_login_rate_limits(client_hash,window_started_at,attempt_count)
    VALUES(${key},NOW(),1) ON CONFLICT(client_hash) DO UPDATE SET
    attempt_count=CASE WHEN admin_login_rate_limits.window_started_at<NOW()-INTERVAL '15 minutes' THEN 1 ELSE admin_login_rate_limits.attempt_count+1 END,
    window_started_at=CASE WHEN admin_login_rate_limits.window_started_at<NOW()-INTERVAL '15 minutes' THEN NOW() ELSE admin_login_rate_limits.window_started_at END,
    updated_at=NOW() RETURNING attempt_count`;
  if (Number(limit.attempt_count) > 8)
    throw new PublicError(
      "Too many sign-in attempts. Try again in 15 minutes.",
      429,
    );
  const [user] =
    await db`SELECT id,email,name,role,status,password_hash FROM users WHERE lower(email)=${email.toLowerCase()} LIMIT 1`;
  const [algorithm, salt, stored] = String(user?.password_hash || "").split(
    "$",
  );
  const expected = stored ? Buffer.from(stored, "base64url") : Buffer.alloc(64);
  const actual = (await scrypt(
    password,
    salt ? Buffer.from(salt, "base64url") : Buffer.alloc(16),
    64,
  )) as Buffer;
  if (
    algorithm !== "scrypt" ||
    expected.length !== actual.length ||
    !timingSafeEqual(actual, expected) ||
    user?.role !== "admin" ||
    user?.status !== "active"
  )
    throw new PublicError(
      "Email or password is incorrect, or administrator access is unavailable.",
      401,
    );
  await db`DELETE FROM admin_login_rate_limits WHERE client_hash=${key}`;
  await db`UPDATE users SET last_login_at=NOW() WHERE id=${user.id}`;
  return {
    userId: String(user.id),
    email: String(user.email),
    name: String(user.name),
    role: "admin",
  };
}
export async function audit(
  actorId: string,
  action: string,
  details: Record<string, string | number> = {},
) {
  const db = getDb(false);
  await db`INSERT INTO audit_logs(id,actor_id,action,entity_type,entity_id,after_data)
    VALUES(${randomUUID()},${actorId},${action},'horizon_internal','analytics',${db.json(details)})`;
}
