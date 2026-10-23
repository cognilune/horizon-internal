import { checkCredentials, sameOrigin, COOKIE, audit } from "@/lib/auth";
import { signSession } from "@/lib/session";
import { apiError, json, PublicError } from "@/lib/db";
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    if (Number(request.headers.get("content-length") || 0) > 4096)
      throw new PublicError("Invalid sign-in request.");
    const body = await request.json();
    if (
      typeof body.email !== "string" ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email) ||
      body.email.length > 254 ||
      typeof body.password !== "string" ||
      body.password.length > 200 ||
      !body.password
    )
      throw new PublicError("Enter a valid email and password.", 422);
    if ((process.env.ADMIN_SESSION_SECRET || "").length < 32)
      throw new PublicError("Administrator sign-in is not configured.", 503);
    const user = await checkCredentials(body.email.trim(), body.password);
    const issuedAt = Math.floor(Date.now() / 1000);
    const token = signSession(
      { ...user, issuedAt, expiresAt: issuedAt + 28800 },
      process.env.ADMIN_SESSION_SECRET!,
    );
    await audit(user.userId, "admin.sign_in");
    const res = json({ ok: true });
    res.headers.set(
      "Set-Cookie",
      `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
    );
    return res;
  } catch (error) {
    return apiError(error);
  }
}
