import { WorkerEntrypoint } from "cloudflare:workers";

const ALLOWED_PREFIXES = ["audio/", "test/"];
const CACHE_CONTROL = "public, max-age=31536000, immutable";

function objectKey(request) {
  return decodeURIComponent(new URL(request.url).pathname.slice(1));
}

function isAllowedKey(key) {
  return ALLOWED_PREFIXES.some((prefix) => key.startsWith(prefix));
}

// Cached entrypoint: return a full 200 from R2. Workers Caching strips Range
// before this runs, stores the 200, then slices 206 for the player.
export class Media extends WorkerEntrypoint {
  async fetch(request) {
    const key = objectKey(request);
    const object = await this.env.AUDIO_BUCKET.get(key);
    if (object === null) {
      return new Response("Audio track not found", { status: 404 });
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);
    headers.set("Accept-Ranges", "bytes");
    headers.set("Content-Length", String(object.size));
    headers.set("Cache-Control", CACHE_CONTROL);
    // Same value on a later request means this body was served from cache.
    headers.set("X-Media-Filled-At", new Date().toISOString());

    return new Response(object.body, { status: 200, headers });
  }
}

export default {
  async fetch(request, env, ctx) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method Not Allowed", {
        status: 405,
        headers: { Allow: "GET, HEAD" },
      });
    }

    if (!env.APP_SECRET || request.headers.get("X-App-Origin") !== env.APP_SECRET) {
      return new Response("Unauthorized Request Source", { status: 403 });
    }

    const key = objectKey(request);
    if (!key || !isAllowedKey(key)) {
      return new Response("Not Found", { status: 404 });
    }

    // Strip headers that force Workers Caching BYPASS (Authorization, Cookie)
    // and the app secret so it never becomes part of the inner cache key.
    const forwarded = new Request(request);
    forwarded.headers.delete("Authorization");
    forwarded.headers.delete("Cookie");
    forwarded.headers.delete("X-App-Origin");

    return ctx.exports.Media.fetch(forwarded);
  },
};
