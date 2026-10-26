import { PublicError } from "./db";

export const previewCsp = "sandbox allow-scripts; default-src 'none'; img-src 'self' data: https: http:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; font-src data: https:; connect-src 'none'; frame-ancestors 'self'; form-action 'none'; base-uri 'self'";

export function preparePreviewContent(content: string, path: string, projectId: string) {
  const root = `/api/admin/project-preview/${encodeURIComponent(projectId)}/`;
  let prepared = content.replaceAll("__PROJECT_ID__", projectId);
  if (!path.toLowerCase().endsWith(".html")) return prepared;
  prepared = prepared.replace(
    /\b(href|src|action)=(['"])\/(?!\/|api\/)([^'"]*)\2/gi,
    (_match, attribute: string, quote: string, target: string) =>
      `${attribute}=${quote}${root}${target}${quote}`,
  );
  const base = `<base href="${root}">`;
  return /<head[\s>]/i.test(prepared)
    ? prepared.replace(/<head([^>]*)>/i, `<head$1>${base}`)
    : `${base}${prepared}`;
}

export async function servePreviewMedia(parts: string[], request: Request) {
  if (!parts.length || parts.some(part => !part || part === "." || part === ".." || /[\\/\0]/.test(part)))
    throw new PublicError("Invalid media path.", 400);
  const origin = new URL(process.env.HORIZON_PUBLIC_ORIGIN ||
    (process.env.NODE_ENV === "production" ? "https://horizon.cognilune.com" : "http://localhost:3000"));
  if (!["http:", "https:"].includes(origin.protocol))
    throw new PublicError("The Horizon media server is not configured correctly.", 503);
  const target = new URL(`/api/media/files/${parts.map(encodeURIComponent).join("/")}`, origin);
  const headers = new Headers();
  for (const name of ["range", "if-none-match", "if-modified-since"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: request.method === "HEAD" ? "HEAD" : "GET",
      headers, cache: "no-store", redirect: "error",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(20_000)]),
    });
  } catch {
    throw new PublicError("The website image could not be loaded. Please retry.", 502);
  }
  if (![200, 206, 304, 404, 416].includes(upstream.status)) {
    await upstream.body?.cancel();
    throw new PublicError("The website image could not be loaded. Please retry.", 502);
  }
  const responseHeaders = new Headers({
    "cache-control": "private, no-store",
    "x-content-type-options": "nosniff",
  });
  for (const name of ["content-type", "content-range", "accept-ranges", "etag", "last-modified", "content-disposition"]) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }
  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
}
