import worker from "./index.js";
import { applyPerformancePatches } from "./performance-html-patches.js";
import { applyCollisionPerformancePatches } from "./collision-html-patches.js";
export { GameRoom } from "./index.js";

const RELOAD_UI_SCRIPT = "/ui-reload-feedback.js?v=20260810a";

export default {
  async fetch(request, env, ctx) {
    const response = await worker.fetch(request, env, ctx);
    const contentType = response.headers.get("content-type") || "";

    // API JSON, static assets, and WebSocket upgrades pass through exactly as
    // the existing worker returned them. This wrapper only adjusts the served
    // game HTML for presentation helpers and targeted performance fixes.
    if (!contentType.includes("text/html")) return response;

    const headers = new Headers(response.headers);
    headers.delete("content-length");
    let html = await response.text();
    html = applyPerformancePatches(html);
    html = applyCollisionPerformancePatches(html);
    const themedHtml = html.includes("/ui-reload-feedback.js")
      ? html
      : html.replace("</body>", `  <script src="${RELOAD_UI_SCRIPT}"></script>\n</body>`);

    return new Response(themedHtml, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};
