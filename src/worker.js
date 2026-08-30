export default {
  async fetch(request, env, ctx) {
    // 1. Validate the secret token
    const appSecret = request.headers.get("X-App-Origin");
    if (!env.APP_SECRET || appSecret !== env.APP_SECRET) {
      return new Response("Unauthorized Request Source", { status: 403 });
    }

    const url = new URL(request.url);
    
    // Decode the path so filenames with spaces/special characters parse cleanly
    const objectName = decodeURIComponent(url.pathname.slice(1)); 
    const rangeHeader = request.headers.get("Range");

    // 2. Safely configure R2 Options with a raw string value
    const r2Options = {};
    if (rangeHeader) {
      r2Options.range = rangeHeader; // Fixed line: passing the raw header string
    }

    // 3. Fetch from the direct R2 binding
    const object = await env.AUDIO_BUCKET.get(objectName, r2Options);

    if (object === null) {
      return new Response(`Audio track not found: ${objectName}`, { status: 404 });
    }

    // 4. Build proper media streaming response headers
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);
    headers.set("Accept-Ranges", "bytes");
    headers.set("Cache-Control", "public, max-age=31536000, s-maxage=31536000");

    // 5. Determine if R2 returned a partial byte slice or the full file context
    const isPartial = rangeHeader && object.size !== object.range?.length;
    const responseStatus = isPartial ? 206 : 200;

    if (isPartial) {
      headers.set(
        "Content-Range", 
        `bytes ${object.range.offset}-${object.range.end}/${object.size}`
      );
    }

    return new Response(object.body, {
      status: responseStatus,
      headers: headers
    });
  }
};
