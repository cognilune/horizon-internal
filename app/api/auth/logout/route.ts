import { sameOrigin, COOKIE } from "@/lib/auth";
import { json, apiError } from "@/lib/db";
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const res = json({ ok: true });
    res.headers.set(
      "Set-Cookie",
      `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
    );
    return res;
  } catch (error) {
    return apiError(error);
  }
}
