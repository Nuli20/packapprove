// Optional local-only API experiment; never used by the app or a deployed environment.
// Start the isolated restricted server on 3030, then run this proxy and point only
// full-cycle.spec.ts at 3045. Browser Origin checks intentionally remain unchanged.
import http from "node:http";
const delay = Number(process.env.PACKAPPROVE_LATENCY_MS || 2000);
if (!Number.isInteger(delay) || delay < 0 || delay > 5000)
  throw Error("Use a latency between 0 and 5000ms");
let requests = 0;
const server = http.createServer(async (req, res) => {
  const path = new URL(req.url, "http://127.0.0.1:3045");
  if (!path.pathname.startsWith("/api/")) {
    res.writeHead(404);
    res.end();
    return;
  }
  const parts = [];
  let size = 0;
  for await (const part of req) {
    size += part.length;
    if (size > 3800000) {
      res.writeHead(413);
      res.end();
      return;
    }
    parts.push(part);
  }
  await new Promise((resolve) => setTimeout(resolve, delay));
  if (res.destroyed) return;
  const headers = { ...req.headers };
  for (const key of ["host", "connection", "content-length"])
    delete headers[key];
  try {
    // Fixed destination, no user-controlled host, no raw request data in logs.
    const response = await fetch(
      "http://127.0.0.1:3030" + path.pathname + path.search,
      {
        method: req.method,
        headers,
        redirect: "manual",
        signal: AbortSignal.timeout(15000),
        body: ["GET", "HEAD"].includes(req.method)
          ? undefined
          : Buffer.concat(parts),
      },
    );
    const bytes = Buffer.from(await response.arrayBuffer());
    requests++;
    if (res.destroyed) return;
    res.writeHead(response.status, {
      ...Object.fromEntries(
        [...response.headers].filter(
          ([key]) =>
            ![
              "set-cookie",
              "content-length",
              "content-encoding",
              "transfer-encoding",
              "connection",
            ].includes(key),
        ),
      ),
      "set-cookie": response.headers.getSetCookie(),
    });
    res.end(bytes);
  } catch {
    if (!res.destroyed) {
      res.writeHead(502);
      res.end();
    }
  }
});
server.listen(3045, "127.0.0.1", () =>
  console.log(JSON.stringify({ localApiProxy: true, delayMs: delay })),
);
process.on("SIGTERM", () => {
  console.log(JSON.stringify({ completedRequests: requests }));
  server.close(() => process.exit(0));
});
