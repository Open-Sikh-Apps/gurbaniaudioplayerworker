export default {
  async fetch(request, env, ctx) {
    // Read the secret securely from Cloudflare's injected environment context
    const appSecret = request.headers.get("X-App-Origin");
    if (!env.APP_SECRET || appSecret !== env.APP_SECRET) {
      return new Response("Unauthorized Request Source", { status: 403 });
    }

    const url = new URL(request.url);
    const objectName = url.pathname.slice(1); 
    const rangeHeader = request.headers.get("Range");

    const r2Options = {};
    if (rangeHeader) {
      r2Options.range = request.headers;
    }

    const object = await env.AUDIO_BUCKET.get(objectName, r2Options);

    if (object === null) {
      return new Response(`Audio track not found: ${objectName}`, { status: 404 });
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);
    headers.set("Accept-Ranges", "bytes");
    headers.set("Cache-Control", "public, max-age=31536000, s-maxage=31536000");

    const isPartial = rangeHeader && object.size !== object.range?.length;
    const responseStatus = isPartial ? 206 : 200;

    if (isPartial) {
      headers.set("Content-Range", `bytes ${object.range.offset}-${object.range.end}/${object.size}`);
    }

    return new Response(object.body, {
      status: responseStatus,
      headers: headers
    });
  }
};
