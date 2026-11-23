import { PublicError } from "./db";
import { signInternalPreviewAsset } from "./internal-preview-auth";

const buildAssetPattern = /^__horizon_assets\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\.png$/;

export function previewBuildAssetSlot(path: string) {
  return buildAssetPattern.exec(path)?.[1] || null;
}

function routePreviewBuildAssets(content: string, root: string) {
  return content.replace(
    /\/__horizon_assets\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.png/g,
    (path) => root + path.slice(1),
  );
}

export const previewCsp = "sandbox allow-scripts; default-src 'none'; img-src 'self' data: https: http:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; font-src data: https:; connect-src 'none'; frame-ancestors 'self'; form-action 'none'; base-uri 'self'";

export function preparePreviewContent(content: string, path: string, projectId: string) {
  const root = `/api/admin/project-preview/${encodeURIComponent(projectId)}/`;
  let prepared = routePreviewBuildAssets(
    content.replaceAll("__PROJECT_ID__", projectId),
    root,
  );
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

export async function servePreviewBuildAsset(
  projectId: string,
  slot: string,
  request: Request,
) {
  const secret = process.env.ADMIN_SESSION_SECRET || "";
  if (secret.length < 32)
    throw new PublicError("The Horizon asset service is not configured.", 503);
  const origin = new URL(
    process.env.HORIZON_PUBLIC_ORIGIN ||
      (process.env.NODE_ENV === "production"
        ? "https://horizon.cognilune.com"
        : "http://localhost:3000"),
  );
  if (!["http:", "https:"].includes(origin.protocol))
    throw new PublicError("The Horizon asset service is not configured.", 503);
  const timestamp = Math.floor(Date.now() / 1000);
  const target = new URL(
    `/api/internal/project-preview-assets/${encodeURIComponent(projectId)}/${encodeURIComponent(slot)}`,
    origin,
  );
  const headers = new Headers({
    "x-horizon-internal-timestamp": String(timestamp),
    "x-horizon-internal-signature": signInternalPreviewAsset(
      secret,
      projectId,
      slot,
      timestamp,
    ),
  });
  for (const name of ["range", "if-none-match", "if-modified-since"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: "GET",
      headers,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.any([
        request.signal,
        AbortSignal.timeout(20_000),
      ]),
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
  for (const name of [
    "content-type",
    "content-range",
    "content-length",
    "accept-ranges",
    "etag",
    "last-modified",
    "content-disposition",
  ]) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }
  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
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
