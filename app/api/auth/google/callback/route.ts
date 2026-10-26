import { NextRequest, NextResponse } from "next/server";
import { audit, COOKIE } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { signSession } from "@/lib/session";

type GoogleTokens = { access_token?: string };
type GoogleUser = {
  sub?: string;
  email?: string;
  email_verified?: boolean;
};

function loginError(request: Request, message: string) {
  const origin = process.env.APP_ORIGIN?.trim() || new URL(request.url).origin;
  const url = new URL("/login", origin);
  url.searchParams.set("googleError", message);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  try {
    const code = request.nextUrl.searchParams.get("code");
    const state = request.nextUrl.searchParams.get("state");
    const expectedState = request.cookies.get(
      "horizon_internal_google_state",
    )?.value;
    const verifier = request.cookies.get(
      "horizon_internal_google_verifier",
    )?.value;
    if (!code || !state || !expectedState || state !== expectedState || !verifier)
      return loginError(
        request,
        "Google sign-in could not be verified. Please try again.",
      );

    const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
    const redirectUri = process.env.GOOGLE_REDIRECT_URI?.trim();
    const sessionSecret = process.env.ADMIN_SESSION_SECRET || "";
    if (!clientId || !clientSecret || !redirectUri || sessionSecret.length < 32)
      return loginError(request, "Administrator Google sign-in is not configured.");

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
        code_verifier: verifier,
      }),
      cache: "no-store",
    });
    const tokens = (await tokenResponse.json()) as GoogleTokens;
    if (!tokenResponse.ok || !tokens.access_token)
      return loginError(
        request,
        "Google authentication was unsuccessful. Please try again.",
      );

    const profileResponse = await fetch(
      "https://openidconnect.googleapis.com/v1/userinfo",
      {
        headers: { authorization: `Bearer ${tokens.access_token}` },
        cache: "no-store",
      },
    );
    const profile = (await profileResponse.json()) as GoogleUser;
    if (
      !profileResponse.ok ||
      !profile.sub ||
      !profile.email ||
      profile.email_verified !== true
    )
      return loginError(request, "Google did not provide a verified email address.");

    const email = profile.email.trim().toLowerCase();
    const db = getDb(false);
    const [user] = await db<{
      id: string;
      email: string;
      name: string;
      role: string;
      status: string;
      google_subject: string | null;
    }[]>`SELECT id,email,name,role,status,google_subject FROM users WHERE lower(email)=${email} LIMIT 1`;
    if (!user || user.role !== "admin")
      return loginError(
        request,
        "This Google account does not have Horizon administrator access.",
      );
    if (user.status === "blocked")
      return loginError(
        request,
        "Your account has been blocked. Contact support if you believe this is a mistake.",
      );
    if (user.status !== "active")
      return loginError(request, "This administrator account is not active.");
    if (user.google_subject && user.google_subject !== profile.sub)
      return loginError(
        request,
        "This administrator account is linked to a different Google account.",
      );

    await db`UPDATE users SET google_subject=${profile.sub},email_verified_at=COALESCE(email_verified_at,NOW()),last_login_at=NOW(),updated_at=NOW() WHERE id=${user.id}`;
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
      sessionSecret,
    );
    await audit(user.id, "admin.google_sign_in");

    const response = NextResponse.redirect(
      new URL("/overview", process.env.APP_ORIGIN || request.url),
    );
    response.cookies.set(COOKIE, token, {
      httpOnly: true,
      // OAuth returns from accounts.google.com. Lax allows the new session on
      // that top-level redirect; state + PKCE protect the callback itself.
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 28800,
    });
    response.cookies.delete("horizon_internal_google_state");
    response.cookies.delete("horizon_internal_google_verifier");
    return response;
  } catch (error) {
    console.error("Horizon Internal Google sign-in failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return loginError(
      request,
      "Google sign-in is temporarily unavailable. Please try again.",
    );
  }
}
