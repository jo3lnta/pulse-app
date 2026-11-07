import test from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const file = name => readFile(resolve(root, name), "utf8");

test("public safety and discovery files exist", async () => {
  for (const name of ["404.html", "robots.txt", "sitemap.xml", "https-redirect.js", "docs/legal.html", "docs/cookies.html", "docs/ai.html"]) {
    await access(resolve(root, name));
  }
  assert.match(await file("robots.txt"), /Sitemap: https:\/\/jo3lnta\.github\.io\/pulse-app\/sitemap\.xml/);
  assert.match(await file("sitemap.xml"), /docs\/privacy\.html/);
});

test("app has SEO, structured data, notices and private Insights", async () => {
  const html = await file("index.html");
  for (const marker of ["rel=\"canonical\"", "application/ld+json", "cookieNotice", "page-insights", "habitJournal", "docs/ai.html", "signupWebsite"]) assert.ok(html.includes(marker), `Missing ${marker}`);
  const app = await file("app.js");
  for (const marker of ["insightEstimate", "renderInsights", "looksLikeSpam", "pulse.habits.v1"]) assert.match(app, new RegExp(marker));
});

