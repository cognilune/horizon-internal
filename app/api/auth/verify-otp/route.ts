import { audit, COOKIE, sameOrigin } from "@/lib/auth";
import { apiError, json, PublicError } from "@/lib/db";
import { internalOtpAuth, otpError } from "@/lib/internal-otp-server";
import { signSession } from "@/lib/session";

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    if (Number(request.headers.get("content-length") || 0) > 4096)
      throw new PublicError("Invalid verification request.", 422);
    const user = await internalOtpAuth().verifyCode(await request.json());
    const issuedAt = Math.floor(Date.now() / 1000);
    const token = signSession(
      {
        userId: user.id,
        email: user.email,
        name: user.name,
        role: "admin",
        issuedAt,
        expiresAt: issuedAt + 28800,
      },
      process.env.ADMIN_SESSION_SECRET!,
    );
    await audit(user.id, "admin.otp_sign_in");
    const response = json({ ok: true });
    response.headers.set(
      "Set-Cookie",
      `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
    );
    return response;
  } catch (error) {
    try {
      return otpError(error);
    } catch {}
    return apiError(error);
  }
}
