// Tiny static server for previewing dist/ locally: node scripts/dev-server.mjs
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "text/javascript",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
};

http
  .createServer((req, res) => {
    const url = decodeURIComponent(req.url.split("?")[0]);
    const file = path.join(DIST, url === "/" ? "index.html" : url);
    try {
      const data = fs.readFileSync(file);
      res.setHeader("Content-Type", TYPES[path.extname(file)] || "application/octet-stream");
      res.end(data);
    } catch {
      res.statusCode = 404;
      res.end("not found");
    }
  })
  .listen(8788, () => console.log("dist/ on http://localhost:8788"));
