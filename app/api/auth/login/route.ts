import { sameOrigin } from "@/lib/auth";
import { apiError, json, PublicError } from "@/lib/db";
import { internalOtpAuth, otpError } from "@/lib/internal-otp-server";
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    if (Number(request.headers.get("content-length") || 0) > 4096)
      throw new PublicError("Invalid sign-in request.");
    const body = await request.json();
    if (
      typeof body.email !== "string"
    )
      throw new PublicError("Enter a valid email address.", 422);
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";
    return json(await internalOtpAuth(true).requestCode(body, ip));
  } catch (error) {
    try {
      return otpError(error);
    } catch {}
    return apiError(error);
  }
}
