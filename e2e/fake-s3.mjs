// Test-only stand-in for Neon Object Storage, so the photo flow can be clicked
// through in a browser without real credentials. Handles the handful of S3 calls
// the app makes, plus CORS. It does not check signatures.
// Usage: node e2e/fake-s3.mjs   (listens on http://localhost:3999)
import { createServer } from "node:http";

const PORT = Number(process.env.FAKE_S3_PORT ?? 3999);
const objects = new Map();

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, HEAD, DELETE",
  "Access-Control-Allow-Headers": "Content-Type, Cache-Control",
  "Access-Control-Expose-Headers": "ETag",
};

const readBody = (request) =>
  new Promise((resolve) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks)));
  });

createServer(async (request, response) => {
  const url = new URL(request.url, `http://localhost:${PORT}`);
  const key = decodeURIComponent(url.pathname.split("/").slice(2).join("/"));
  const object = objects.get(key);
  const notFound = () => {
    response.writeHead(404, { ...cors, "Content-Type": "application/xml" });
    response.end("<Error><Code>NoSuchKey</Code></Error>");
  };

  if (request.method === "OPTIONS") {
    response.writeHead(204, cors);
    return response.end();
  }

  if (request.method === "PUT") {
    objects.set(key, {
      body: await readBody(request),
      type: request.headers["content-type"] ?? "application/octet-stream",
      cache: request.headers["cache-control"] ?? "",
    });
    console.log(`PUT ${key} ${objects.get(key).body.length} bytes ${objects.get(key).type} cache=${objects.get(key).cache}`);
    response.writeHead(200, { ...cors, ETag: '"fake"' });
    return response.end();
  }

  if (request.method === "POST" && url.searchParams.has("delete")) {
    const xml = (await readBody(request)).toString();
    for (const [, deleted] of xml.matchAll(/<Key>([^<]+)<\/Key>/g)) objects.delete(deleted);
    response.writeHead(200, { "Content-Type": "application/xml" });
    return response.end("<DeleteResult></DeleteResult>");
  }

  if (request.method === "DELETE") {
    objects.delete(key);
    console.log(`DELETE ${key}`);
    response.writeHead(204, cors);
    return response.end();
  }

  if (!object) return notFound();
  const headers = { ...cors, "Content-Type": object.type, "Content-Length": object.body.length, "Cache-Control": object.cache, ETag: '"fake"' };

  if (request.method === "HEAD") {
    response.writeHead(200, headers);
    return response.end();
  }

  const range = request.headers.range?.match(/bytes=(\d+)-(\d+)/);
  if (range) {
    const slice = object.body.subarray(Number(range[1]), Number(range[2]) + 1);
    response.writeHead(206, { ...headers, "Content-Length": slice.length, "Content-Range": `bytes ${range[1]}-${range[2]}/${object.body.length}` });
    return response.end(slice);
  }
  response.writeHead(200, headers);
  response.end(object.body);
}).listen(PORT, () => console.log(`fake storage on http://localhost:${PORT}`));
