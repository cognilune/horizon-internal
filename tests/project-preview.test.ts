import assert from "node:assert/strict";
import { test } from "node:test";
import { preparePreviewContent, servePreviewMedia } from "../lib/project-preview";
import { renderPreviewContent } from "../lib/preview-document";

test("preview embeds images, styles and scripts without cookie-dependent subrequests", async t => {
  const fetch = t.mock.method(globalThis, "fetch", async () => new Response(new Uint8Array([137, 80, 78, 71]), { headers: { "content-type": "image/png" } }));
  const html = await renderPreviewContent([{ path: "index.html", content: `<html><head><link rel="icon" href="assets/logo.svg"><link rel="stylesheet" href="assets/style.css"><script defer src="assets/app.js"></script></head><body>
    <img src="/api/media/files/generated/a.png?version=2" srcset="http://localhost:3000/api/media/files/generated/a.png 1x, https://horizon.cognilune.com/api/media/files/generated/b.png 2x">
    <img data-generated-image="produce" alt="Produce"><img data-hero-image src="" alt="Hero">
    <img src="//horizon.cognilune.com/api/media/files/generated/c.png">
    <img src="https://images.example/photo.png">
    <img src="assets/logo.svg"><a href="/about.html">About</a>
    </body></html>` },
    { path: "assets/style.css", content: ".hero{background:url('/api/media/files/generated/a.png')}" },
    { path: "assets/catalog.js", content: "const images={hero:'/api/media/files/generated/b.png',produce:'/api/media/files/generated/a.png'};" },
    { path: "assets/app.js", content: "window.image='/api/media/files/generated/b.png';" },
    { path: "assets/logo.svg", content: '<svg xmlns="http://www.w3.org/2000/svg"></svg>' },
  ], "index.html", "gym", new Request("http://localhost:3100/preview"));
  assert.ok(html.includes(`<base href="/api/admin/project-preview/gym/">`));
  assert.equal(fetch.mock.callCount(), 3, "one fetch per unique generated image");
  assert.ok(html.includes('src="data:image/png;base64,iVBORw=="'));
  assert.ok(html.includes('srcset="data:image/png;base64,iVBORw== 1x, data:image/png;base64,iVBORw== 2x"'));
  assert.match(html, /var images=\{"hero":"generated\/b\.png","produce":"generated\/a\.png"\}/);
  assert.match(html, /,media=\{"generated\/b\.png":"data:image\/png;base64,iVBORw==","generated\/a\.png":"data:image\/png;base64,iVBORw=="\}/);
  assert.match(html, /querySelectorAll\('\[data-generated-image\]'\)/);
  assert.match(html, /src="data:image\/svg\+xml;base64,/);
  assert.match(html, /<link rel="icon" href="data:image\/svg\+xml;base64,/);
  assert.ok(html.includes('src="https://images.example/photo.png"'));
  assert.ok(html.includes('href="/api/admin/project-preview/gym/about.html"'));
  assert.match(html, /<style>\.hero\{background:url\("data:image\/png/);
  assert.match(html, /window\.image='\/api\/media\/files\/generated\/b\.png'/);
  assert.match(html, /media=\{"generated\/b\.png":"data:image\/png;base64,iVBORw=="/);
  assert.match(html, /Object\.defineProperty\(window,name/);
  assert.doesNotMatch(html, /<link[^>]*stylesheet|<script[^>]*src=/);
  assert.equal(preparePreviewContent("__PROJECT_ID__", "assets/app.js", "gym"), "gym");
});

test("preview rejects non-image upstream bodies", async t => {
  t.mock.method(globalThis, "fetch", async () => new Response("<html>Login</html>", { headers: { "content-type": "text/html" } }));
  await assert.rejects(renderPreviewContent([{ path: "index.html", content: '<img src="/api/media/files/generated/a.png">' }], "index.html", "gym", new Request("http://localhost/preview")), /website image is unavailable/);
});

test("media proxy preserves image bytes and never forwards admin credentials", async t => {
  const previous = process.env.HORIZON_PUBLIC_ORIGIN;
  process.env.HORIZON_PUBLIC_ORIGIN = "http://localhost:3000";
  t.after(() => { if (previous === undefined) delete process.env.HORIZON_PUBLIC_ORIGIN; else process.env.HORIZON_PUBLIC_ORIGIN = previous; });
  const image = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const requests: { url: string; init: RequestInit }[] = [];
  t.mock.method(globalThis, "fetch", async (url: URL, init: RequestInit) => {
    requests.push({ url: String(url), init });
    return new Response(init.method === "HEAD" ? null : image, { headers: { "content-type": "image/png", "set-cookie": "untrusted=value" } });
  });
  const response = await servePreviewMedia(["generated", "image one.png"], new Request("http://localhost:3100/preview", {
    headers: { cookie: "horizon_internal_session=secret", authorization: "Bearer secret", range: "bytes=0-7" },
  }));
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), image);
  assert.equal(response.headers.get("content-type"), "image/png");
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(requests[0].url, "http://localhost:3000/api/media/files/generated/image%20one.png");
  const headers = requests[0].init.headers as Headers;
  assert.equal(headers.get("cookie"), null);
  assert.equal(headers.get("authorization"), null);
  assert.equal(headers.get("range"), "bytes=0-7");
  assert.equal(requests[0].init.redirect, "error");
  await servePreviewMedia(["generated", "image.png"], new Request("http://localhost:3100/preview", { method: "HEAD" }));
  assert.equal(requests[1].init.method, "HEAD");
});

test("invalid media paths are rejected before upstream access", async t => {
  const fetch = t.mock.method(globalThis, "fetch", async () => { throw new Error("Unexpected network access"); });
  for (const parts of [[], ["..", "secret"], ["."], ["generated", "../secret"], ["generated", "a\\b"], ["generated", "\0"]])
    await assert.rejects(servePreviewMedia(parts, new Request("http://localhost:3100/preview")), /Invalid media path/);
  assert.equal(fetch.mock.callCount(), 0);
});

test("missing images and upstream failures retain useful HTTP errors", async t => {
  t.mock.method(globalThis, "fetch", async () => new Response(null, { status: 404 }));
  assert.equal((await servePreviewMedia(["missing.png"], new Request("http://localhost/preview"))).status, 404);
  t.mock.method(globalThis, "fetch", async () => new Response("upstream private details", { status: 500 }));
  await assert.rejects(servePreviewMedia(["image.png"], new Request("http://localhost/preview")), /The website image could not be loaded/);
});
