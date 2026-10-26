import { NextResponse } from "next/server";

function base64Url(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("base64url");
}

export async function GET(request: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const redirectUri = process.env.GOOGLE_REDIRECT_URI?.trim();
  if (!clientId || !process.env.GOOGLE_CLIENT_SECRET?.trim() || !redirectUri)
    return NextResponse.redirect(
      new URL("/login?googleError=Google+sign-in+is+not+configured", request.url),
    );

  const callback = new URL(redirectUri);
  if (callback.pathname !== "/api/auth/google/callback")
    return NextResponse.redirect(
      new URL("/login?googleError=Google+callback+URL+is+invalid", request.url),
    );

  const state = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(48)));
  const challenge = base64Url(
    new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(verifier),
      ),
    ),
  );
  const google = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  google.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callback.toString(),
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();

  const response = NextResponse.redirect(google);
  const cookie = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 10 * 60,
  };
  response.cookies.set("horizon_internal_google_state", state, cookie);
  response.cookies.set("horizon_internal_google_verifier", verifier, cookie);
  return response;
}
