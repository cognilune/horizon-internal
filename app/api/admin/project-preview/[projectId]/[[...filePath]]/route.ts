import { requireAdmin } from "@/lib/auth";
import { apiError, getDb, PublicError } from "@/lib/db";
import { previewCsp } from "@/lib/project-preview";
import { renderPreviewContent } from "@/lib/preview-document";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const contentTypes: Record<string, string> = {
  html: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  svg: "image/svg+xml; charset=utf-8",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  ico: "image/x-icon",
};

function safePath(parts?: string[]) {
  const path = parts?.length ? parts.join("/") : "index.html";
  if (!path || path.includes("..") || path.includes("\\") || path.startsWith("/"))
    throw new PublicError("Invalid preview path.", 400);
  return path;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string; filePath?: string[] }> },
) {
  try {
    await requireAdmin();
    const { projectId, filePath } = await params;
    if (!projectId || projectId.length > 200)
      throw new PublicError("Project not found.", 404);
    const path = safePath(filePath);
    const db = getDb();
    const rows = await db<{ path: string; content: string }[]>`
      SELECT f.path,f.content FROM ai_project_files f
      JOIN ai_projects p ON p.id=f.project_id
      WHERE p.id=${projectId} AND p.deleted_at IS NULL
        AND COALESCE((p.memory->>'adminBlocked')::boolean,false)=false
      `;

    const content = await renderPreviewContent(rows, path, projectId, request);
    const extension = path.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] || "";
    return new Response(content, {
      headers: {
        "content-type": contentTypes[extension] || "application/octet-stream",
        "content-security-policy": previewCsp,
        "cache-control": "private, no-store",
        "referrer-policy": "no-referrer",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
