import { gzip } from "node:zlib";
import { promisify } from "node:util";

const compress = promisify(gzip);

// App Router JSON responses are streamed and are not reliably compressed by
// Next's static response compression. Keep private analytical data uncacheable.
export async function previewJson(
  request: Pick<Request, "headers">,
  value: unknown,
  extraHeaders: Record<string, string> = {},
) {
  const body = JSON.stringify(value);
  const headers = new Headers({
    ...extraHeaders,
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "private, no-store",
    Vary: "Accept-Encoding",
  });
  const acceptsGzip = (request.headers.get("accept-encoding") ?? "")
    .split(",")
    .some((entry) => {
      const [encoding, ...parameters] = entry.trim().toLowerCase().split(";");
      const quality = parameters.find((p) => p.trim().startsWith("q="));
      return encoding === "gzip" && (!quality || Number(quality.trim().slice(2)) > 0);
    });
  if (!acceptsGzip || Buffer.byteLength(body) < 1024)
    return new Response(body, { headers });
  const zipped = await compress(body);
  headers.set("Content-Encoding", "gzip");
  return new Response(new Uint8Array(zipped), { headers });
}
