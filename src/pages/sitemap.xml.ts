import type { APIRoute } from "astro";

const SITE_URL = "https://habitatias.com";

const pages = [
  "/",
  "/book/",
  "/notes/",
  "/pyq/",
  "/guidance/",
  "/trends/",
  "/mock-tests/",
  "/jharkhand/",
  "/resources/",
  "/contact/",

  // UPSC
  "/upsc/",
  "/upsc/overview/",
  "/upsc/syllabus/",
  "/upsc/prelims/",
  "/upsc/mains/",
  "/upsc/pyq/",
  "/upsc/current-affairs/",
  "/upsc/strategy/",
  "/upsc/resources/",
  "/upsc/trends/",
];

export const GET: APIRoute = () => {

  const urls = pages
    .map(
      (page) => `
  <url>
    <loc>${SITE_URL}${page}</loc>
  </url>`
    )
    .join("");

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset
  xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
>
${urls}
</urlset>`;

  return new Response(sitemap, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
    },
  });
};