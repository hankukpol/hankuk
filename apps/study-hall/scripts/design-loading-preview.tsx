import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import AdminLoading from "../app/[division]/admin/loading";

const { JSDOM } = createRequire(import.meta.url)("jsdom") as {
  JSDOM: new (html: string) => { window: Window; serialize(): string };
};

// Render the real transient component in the real shell without changing app routes.
Object.assign(globalThis, { React });
const upstream = "http://127.0.0.1:3000";
async function main() {
  const login = await fetch(`${upstream}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin-police@mock.local", password: "test1234" }),
  });
  if (!login.ok) throw new Error(`Mock login failed: ${login.status}`);
  const cookie = login.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
  const response = await fetch(`${upstream}/police/admin/design-audit-missing`, { headers: { cookie } });
  if (!response.ok) throw new Error(`Shell unavailable: ${response.status}`);
  const dom = new JSDOM(await response.text());
  const frame = dom.window.document.querySelector(".admin-content-frame");
  if (!frame) throw new Error("Admin shell was not rendered");
  const page = frame.querySelector(".admin-flat-page");
  if (!page) throw new Error("Preview insertion point was not rendered");
  page.outerHTML = renderToStaticMarkup(<AdminLoading />);
  dom.window.document.querySelectorAll("script").forEach(node => node.remove());
  const html = dom.serialize();
  dom.window.close();
  createServer(async (request, result) => {
    try {
      if (request.url === "/") {
        result.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        result.end(html);
        return;
      }
      if (!request.url?.startsWith("/_next/")) {
        result.writeHead(404).end();
        return;
      }
      const asset = await fetch(new URL(request.url, upstream));
      result.writeHead(asset.status, { "Content-Type": asset.headers.get("content-type") ?? "application/octet-stream" });
      result.end(Buffer.from(await asset.arrayBuffer()));
    } catch (error) {
      result.writeHead(500).end(String(error));
    }
  }).listen(3102, "127.0.0.1", () => console.log("Loading component preview: http://localhost:3102"));
}
void main();
