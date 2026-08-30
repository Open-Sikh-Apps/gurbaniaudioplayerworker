export default {
  async fetch(request, env, ctx) {
    const appSecret = request.headers.get("X-App-Origin");
    if (!env.APP_SECRET || appSecret !== env.APP_SECRET) {
      return new Response("Unauthorized Request Source", { status: 403 });
    }

    const url = new URL(request.url);
    const objectName = decodeURIComponent(url.pathname.slice(1)); 
    const rangeHeader = request.headers.get("Range");

    // FIXED: Parse the "bytes=0-1023" string into a clean { offset, length } object
    const r2Options = {};
    if (rangeHeader) {
      const match = rangeHeader.match(/^bytes=(\d+)-(\d+)?$/);
      if (match) {
        const start = parseInt(match[1], 10);
        const end = match[2] ? parseInt(match[2], 10) : undefined;
        
        r2Options.range = { offset: start };
        if (end !== undefined) {
          r2Options.range.length = end - start + 1;
        }
      } else {
        // Fallback: If regex fails (e.g. complex range), pass the raw header
        r2Options.range = rangeHeader;
      }
    }

    let object;
    try {
      object = await env.AUDIO_BUCKET.get(objectName, r2Options);
    } catch (r2Error) {
      // Log the exact error for debugging if needed
      return new Response(`R2 Range Error: ${r2Error.message}`, { status: 400 });
    }

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
