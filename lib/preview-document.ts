import { PublicError } from "./db";
import { preparePreviewContent, servePreviewMedia } from "./project-preview";

type ProjectFile = { path: string; content: string };
const rasterTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"]);

async function replaceAsync(text: string, pattern: RegExp, replacement: (match: RegExpExecArray) => Promise<string>) {
  const matches = [...text.matchAll(pattern)];
  const replacements = await Promise.all(matches.map(replacement));
  let result = "", previous = 0;
  matches.forEach((match, index) => {
    result += text.slice(previous, match.index) + replacements[index];
    previous = match.index! + match[0].length;
  });
  return result + text.slice(previous);
}

// Only called after admin authentication and the project's visibility check.
// Embedding assets preserves the sandbox and avoids cookie-dependent requests
// without exposing any new public routes or weakening authentication.
export async function renderPreviewContent(files: ProjectFile[], path: string, projectId: string, request: Request) {
  const sources = new Map(files.map(file => [file.path, file.content]));
  const source = sources.get(path);
  if (source === undefined) throw new PublicError("Website preview is unavailable.", 404);
  if (!path.toLowerCase().endsWith(".html")) return preparePreviewContent(source, path, projectId);
  const media = new Map<string, Promise<string>>();
  let totalBytes = 0;
  function imageData(key: string) {
    if (!media.has(key)) media.set(key, (async () => {
      const response = await servePreviewMedia(key.split("/").map(decodeURIComponent), new Request(request.url, { signal: request.signal }));
      const mime = response.headers.get("content-type")?.split(";")[0].toLowerCase() || "";
      if (!response.ok || !response.body || !rasterTypes.has(mime)) {
        await response.body?.cancel();
        throw new PublicError("A website image is unavailable. Please retry.", 502);
      }
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let length = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          length += value.length; totalBytes += value.length;
          if (length > 10 * 1024 * 1024 || totalBytes > 40 * 1024 * 1024) {
            await reader.cancel();
            throw new PublicError("The website images are too large to preview.", 413);
          }
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
      return `data:${mime};base64,${Buffer.concat(chunks).toString("base64")}`;
    })());
    return media.get(key)!;
  }
  function embedMedia(content: string) {
    return replaceAsync(content,
      /(^|[\s"'`(=:,])(?:(?:https?:)?\/\/[^/\s"'`<>]+)?\/api\/media\/files\/([^\s"'`<>?#)]+)(?:[?#][^\s"'`<>)]*)?/gi,
      async match => match[1] + await imageData(match[2]));
  }
  function mediaKey(value: string) {
    return /\/api\/media\/files\/([^\s"'`<>?#)]+)/i.exec(value)?.[1] || null;
  }
  const namedImages = new Map<string, string>();
  for (const file of files) {
    for (const object of file.content.matchAll(/\b(?:const|let|var)\s+images\s*=\s*\{([\s\S]*?)\}\s*;/gi)) {
      for (const entry of object[1].matchAll(/(?:^|,)\s*(?:["']([^"']+)["']|([\w-]+))\s*:\s*(["'])(.*?)\3/g)) {
        const key = mediaKey(entry[4]);
        if (key) namedImages.set(entry[1] || entry[2], key);
      }
    }
  }
  function localPath(value: string, from: string) {
    if (!value || /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(value)) return null;
    try {
      const resolved = decodeURIComponent(new URL(value, `https://preview.invalid/${from}`).pathname.slice(1));
      return sources.has(resolved) ? resolved : null;
    } catch { return null; }
  }
  async function embedAsset(value: string, from: string) {
    const target = localPath(value, from);
    if (!target) return value;
    return target.endsWith(".svg") ? `data:image/svg+xml;base64,${Buffer.from(sources.get(target)!).toString("base64")}` : value;
  }
  function attribute(tag: string, name: string) {
    return new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, "i").exec(tag)?.[2];
  }
  let content = await embedMedia(source);
  content = await replaceAsync(content, /<link\b[^>]*>/gi, async match => {
    const rel = attribute(match[0], "rel")?.toLowerCase() || "";
    if (/(?:^|\s)(?:icon|apple-touch-icon|mask-icon)(?:\s|$)/.test(rel))
      return replaceAsync(match[0], /\bhref\s*=\s*(['"])(.*?)\1/gi,
        async href => `href=${href[1]}${await embedAsset(href[2], path)}${href[1]}`);
    if (rel !== "stylesheet") return match[0];
    const target = localPath(attribute(match[0], "href") || "", path);
    if (!target) return match[0];
    let css = await embedMedia(sources.get(target)!);
    css = await replaceAsync(css, /url\(\s*(['"]?)([^'"\s)]+)\1\s*\)/gi,
      async url => `url("${await embedAsset(url[2], target)}")`);
    const media = attribute(match[0], "media");
    return `<style${media ? ` media="${media.replaceAll('"', "&quot;")}"` : ""}>${css.replace(/<\/style/gi, "<\\/style")}</style>`;
  });
  const scripts: string[] = [];
  content = await replaceAsync(content, /<script\b([^>]*)>\s*<\/script\s*>/gi, async match => {
    const target = localPath(attribute(match[0], "src") || "", path);
    if (!target) return match[0];
    const script = sources.get(target)!;
    const attrs = match[1].replace(/\b(?:src|defer|async|integrity|crossorigin)(?:\s*=\s*(["']).*?\1)?/gi, "");
    scripts.push(`<script${attrs}>${script.replace(/<\/script/gi, "<\\/script")}</script>`);
    return "";
  });
  content = await replaceAsync(content, /<(?:img|source|video|input)\b[^>]*>/gi, async match =>
    replaceAsync(match[0], /\b(src|poster)\s*=\s*(['"])(.*?)\2/gi,
      async attr => `${attr[1]}=${attr[2]}${await embedAsset(attr[3], path)}${attr[2]}`));
  // Opaque sandbox origins throw when generated sites touch Web Storage. Give
  // the preview its own non-persistent storage so site scripts can keep running
  // without sharing Horizon Internal's origin or admin data.
  const storageShim = `<script>(function(){function storage(){var values=Object.create(null),keys=[];return{get length(){return keys.length},key:function(i){return keys[i]||null},getItem:function(k){k=String(k);return Object.prototype.hasOwnProperty.call(values,k)?values[k]:null},setItem:function(k,v){k=String(k);if(!Object.prototype.hasOwnProperty.call(values,k))keys.push(k);values[k]=String(v)},removeItem:function(k){k=String(k);if(!Object.prototype.hasOwnProperty.call(values,k))return;delete values[k];keys.splice(keys.indexOf(k),1)},clear:function(){values=Object.create(null);keys=[]}}}for(var i=0;i<2;i++){var name=i?'sessionStorage':'localStorage';try{window[name].length}catch(error){Object.defineProperty(window,name,{value:storage(),configurable:false})}}})();</script>`;
  // Run original script types after markup is parsed, preserving classic globals.
  scripts.unshift(storageShim);
  const runtimeEntries = await Promise.all(
    [...namedImages].map(async ([name, key]) => ({ name, key, source: await imageData(key) })),
  );
  const runtimeImages = Object.fromEntries(runtimeEntries.map(entry => [entry.name, entry.key]));
  const runtimeMedia = Object.fromEntries(runtimeEntries.map(entry => [entry.key, entry.source]));
  const serializedImages = JSON.stringify(runtimeImages).replace(/</g, "\\u003c");
  const serializedMedia = JSON.stringify(runtimeMedia).replace(/</g, "\\u003c");
  scripts.push(`<script>(function(){var images=${serializedImages},media=${serializedMedia};function named(name){return media[images[name]]}function apply(root){var scope=root&&root.querySelectorAll?root:document;scope.querySelectorAll('[data-generated-image]').forEach(function(image){var source=named(image.dataset.generatedImage);if(source)image.src=source});scope.querySelectorAll('[data-hero-image]').forEach(function(image){var source=named('hero');if(source)image.src=source});scope.querySelectorAll('img[src*="/api/media/files/"]').forEach(function(image){var source=image.getAttribute('src')||'',match=/\\/api\\/media\\/files\\/([^?#]+)/.exec(source);if(match&&media[decodeURIComponent(match[1])])image.src=media[decodeURIComponent(match[1])]})}apply(document);new MutationObserver(function(records){records.forEach(function(record){record.addedNodes.forEach(apply)})}).observe(document.documentElement,{childList:true,subtree:true})})();</script>`);
  content = /<\/body\s*>/i.test(content)
    ? content.replace(/<\/body\s*>/i, () => scripts.join("\n") + "</body>")
    : content + scripts.join("\n");
  return preparePreviewContent(content, path, projectId);
}
