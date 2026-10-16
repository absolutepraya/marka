import type { APIRoute } from "astro";
import { LOCAL_PREVIEW_ORIGIN } from "../constants";

export const prerender = true;

export const GET: APIRoute = ({ site }) => {
  const siteUrl = site ?? new URL(LOCAL_PREVIEW_ORIGIN);
  const landingUrl = new URL("/", siteUrl).href;
  const xmlUrl = landingUrl.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${xmlUrl}</loc></url>
</urlset>
`;

  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
};
