import worker from "./index.js";
import { applyPerformancePatches } from "./performance-html-patches.js";
import { applyCollisionPerformancePatches } from "./collision-html-patches.js";
import { applyUiFeedbackPatches } from "./ui-feedback-html-patches.js";
export { GameRoom } from "./index.js";

const RELOAD_UI_SCRIPT = "/ui-reload-feedback.js?v=20260810a";
const FINAL_GAMEPLAY_CSS = "/ui-final-gameplay.css?v=20260810a";
const FINAL_GAMEPLAY_SCRIPT = "/ui-final-gameplay.js?v=20260810a";
const FEEDBACK_CLARITY_CSS = "/ui-feedback-clarity.css?v=20260810b";
const FEEDBACK_CLARITY_SCRIPT = "/ui-feedback-clarity.js?v=20260810b";

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
    html = applyUiFeedbackPatches(html);

    const styles = [];
    if (!html.includes("/ui-final-gameplay.css")) styles.push(`<link rel="stylesheet" href="${FINAL_GAMEPLAY_CSS}">`);
    if (!html.includes("/ui-feedback-clarity.css")) styles.push(`<link rel="stylesheet" href="${FEEDBACK_CLARITY_CSS}">`);
    if (styles.length) html = html.replace("</head>", `  ${styles.join("\n  ")}\n</head>`);

    const scripts = [];
    if (!html.includes("/ui-reload-feedback.js")) scripts.push(`<script src="${RELOAD_UI_SCRIPT}"></script>`);
    if (!html.includes("/ui-final-gameplay.js")) scripts.push(`<script src="${FINAL_GAMEPLAY_SCRIPT}"></script>`);
    if (!html.includes("/ui-feedback-clarity.js")) scripts.push(`<script src="${FEEDBACK_CLARITY_SCRIPT}"></script>`);
    if (scripts.length) html = html.replace("</body>", `  ${scripts.join("\n  ")}\n</body>`);

    return new Response(html, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};
