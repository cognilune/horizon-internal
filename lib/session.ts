import { createHmac, timingSafeEqual } from "node:crypto";
export type Session = {
  userId: string;
  email: string;
  name: string;
  role: string;
  issuedAt: number;
  expiresAt: number;
};
// Compatible with Horizon's HMAC-SHA256 session format. Authorization is rechecked in the database.
export function signSession(session: Session, secret: string) {
  if (secret.length < 32) throw new Error("Session signing is not configured.");
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  return `${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
}
export function verifySession(
  token: string,
  secret: string,
  now = Math.floor(Date.now() / 1000),
): Session | null {
  try {
    if (secret.length < 32) return null;
    const [payload, signature, extra] = token.split(".");
    if (!payload || !signature || extra) return null;
    const actual = Buffer.from(signature, "base64url"),
      expected = createHmac("sha256", secret).update(payload).digest();
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
      return null;
    const s = JSON.parse(
      Buffer.from(payload, "base64url").toString(),
    ) as Session;
    if (
      !s.userId ||
      !s.email ||
      s.role !== "admin" ||
      !Number.isFinite(s.expiresAt) ||
      !Number.isFinite(s.issuedAt) ||
      s.expiresAt <= now ||
      s.issuedAt > now + 60 ||
      s.expiresAt - s.issuedAt > 28800 ||
      s.issuedAt > s.expiresAt
    )
      return null;
    return s;
  } catch {
    return null;
  }
}
export async function authorizeSession(
  token: string,
  secret: string,
  lookup: (id: string) => Promise<{
    name: string;
    email: string;
    role: string;
    status: string;
  } | null>,
  now?: number,
) {
  const session = verifySession(token, secret, now);
  if (!session) return null;
  const user = await lookup(session.userId);
  if (!user || user.role !== "admin" || user.status !== "active") return null;
  return { ...session, name: user.name, email: user.email };
}
