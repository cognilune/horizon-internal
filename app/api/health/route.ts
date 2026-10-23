export async function GET() {
  return Response.json(
    { status: "ok", service: "horizon-internal" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
