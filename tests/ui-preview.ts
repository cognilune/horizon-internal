// Test-only UI harness. In-memory PostgreSQL fixture; no credentials, production
// database access, auth bypass in the app, or Next.js route is installed.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";
import path from "node:path";
import { fixture } from "./fixture";
import { overview, table, detail, search } from "../lib/analytics";
import { parseFilters, resources, toCsv, type Resource } from "../lib/filters";
import { catalog, limitations } from "../lib/catalog";

async function main() {
  const db = await fixture();
  const compiled = await build({
    entryPoints: ["tests/ui-entry.tsx"],
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"development"' },
    alias: {
      "next/navigation": path.resolve("tests/ui-navigation.tsx"),
      "next/link": path.resolve("tests/ui-link.tsx"),
    },
  });
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", "http://127.0.0.1:3101");
      if (url.pathname === "/bundle.js") {
        res.setHeader("Content-Type", "text/javascript");
        res.end(compiled.outputFiles[0].text);
        return;
      }
      if (url.pathname === "/globals.css") {
        res.setHeader("Content-Type", "text/css");
        res.end(await readFile("app/globals.css"));
        return;
      }
      if (url.pathname === "/api/admin") {
        const f = parseFilters(
            url.searchParams,
            new Date("2026-10-22T12:00:00Z"),
          ),
          view = url.searchParams.get("view") || "overview",
          resource = url.searchParams.get("resource") as Resource;
        let data: unknown;
        if (view === "overview") data = await overview(db.query, f);
        else if (view === "settings")
          data = {
            catalog,
            limitations,
            configuration: {
              environment: "Isolated in-memory test fixture",
              access: "Fixture administrator",
              reportingTimezone: "UTC",
            },
          };
        else if (view === "search")
          data = {
            rows: await search(db.query, url.searchParams.get("q") || ""),
          };
        else if (!resources.includes(resource)) {
          res.statusCode = 404;
          data = { error: "Unknown resource" };
        } else if (view === "detail")
          data = await detail(
            db.query,
            resource,
            url.searchParams.get("id") || "",
            f,
          );
        else {
          const result = await table(db.query, resource, f, {
            export: view === "export",
            allDates: url.searchParams.get("allDates") === "true",
          });
          if (view === "export") {
            res.setHeader("Content-Type", "text/csv");
            res.end(
              toCsv(result.rows, Object.keys(result.rows[0] || { id: "" })),
            );
            return;
          }
          data = result;
        }
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(data));
        return;
      }
      if (url.pathname === "/desktop" || url.pathname === "/mobile") {
        const width = url.pathname === "/desktop" ? 1440 : 390;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end(
          `<html><body style="margin:0;width:${width}px"><iframe title="${width}px isolated fixture" src="/overview" width="${width}" height="1400" style="border:0;display:block"></iframe></body></html>`,
        );
        return;
      }
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(
        '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Horizon · isolated UI test</title><link rel="stylesheet" href="/globals.css"></head><body><div style="position:fixed;bottom:0;left:0;background:#382e52;color:white;font:10px sans-serif;padding:5px 12px;z-index:9999;pointer-events:none">ISOLATED TEST FIXTURE · NOT LIVE DATA</div><div id="root"></div><script type="module" src="/bundle.js"></script></body></html>',
      );
    } catch (error) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: (error as Error).message }));
    }
  });
  server.listen(3101, "127.0.0.1", () =>
    console.log(
      "Isolated UI test: http://127.0.0.1:3101/overview (desktop: /desktop; mobile: /mobile)",
    ),
  );
  for (const signal of ["SIGINT", "SIGTERM"] as const)
    process.on(signal, () =>
      server.close(() => {
        void db.pg.close();
        process.exit();
      }),
    );
}
main();
