import type { APIRoute } from "astro";
import { LOCAL_PREVIEW_ORIGIN } from "../constants";

export const prerender = true;

export const GET: APIRoute = ({ site }) => {
  const siteUrl = site ?? new URL(LOCAL_PREVIEW_ORIGIN);
  const sitemapUrl = new URL("/sitemap.xml", siteUrl).href;

  return new Response(`User-agent: *\nAllow: /\n\nSitemap: ${sitemapUrl}\n`, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
