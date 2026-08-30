export default {
  async fetch(request, env, ctx) {
    // 1. Validate the secret token validation firewall
    const appSecret = request.headers.get("X-App-Origin");
    if (!env.APP_SECRET || appSecret !== env.APP_SECRET) {
      return new Response("Unauthorized Request Source", { status: 403 });
    }

    const url = new URL(request.url);
    const objectName = decodeURIComponent(url.pathname.slice(1)); 
    const rangeHeader = request.headers.get("Range");

    const r2Options = {};
    if (rangeHeader) {
      // FIXED LINE: Cleans "bytes=0-1023" into just "0-1023" for the R2 API engine
      r2Options.range = rangeHeader.replace("bytes=", "");
    }

    let object;
    try {
      // 2. Fetch the target audio file from your native direct R2 bucket binding
      object = await env.AUDIO_BUCKET.get(objectName, r2Options);
    } catch (r2Error) {
      return new Response(`R2 Engine Error or Invalid Path: ${objectName}`, { status: 404 });
    }

    // 3. Fallback check if object metadata returns null
    if (object === null) {
      return new Response(`Audio track not found: ${objectName}`, { status: 404 });
    }

    // 4. Build proper media streaming response headers
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);
    headers.set("Accept-Ranges", "bytes");
    headers.set("Cache-Control", "public, max-age=31536000, s-maxage=31536000");

    // 5. Determine if R2 returned a partial byte slice or the full track content
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
