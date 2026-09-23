# Marka landing media asset manifest

This private repository manifest records the public message, source, creator, privacy review, rights status, dimensions, and use of each landing asset. It stays outside `public/` because Astro publishes every file under that directory. Source-card and poster illustrations are original local artwork. Their source is `apps/landing/scripts/generate-demo-art.mjs`; run it with the landing package's installed `sharp` dependency to regenerate the WebP files.

The inherited `apps/landing/public/screenshot.png`, `public/screenshots/*`, and `src/assets/hero.webp` are not used as Marka marketing media. They show the upstream Hoarder or Karakeep identity and are not an approved Marka product capture.

## Current local artwork

All generated cards and poster illustrations are 1120 × 720 WebP exports from original 560 × 360 vector artwork authored for this page. They contain no externally sourced image, third-party logo, account detail, or live post. Source labels are descriptive examples only and do not claim a live integration, partnership, or endorsement.

| Asset | Intended message and source type | Creator and rights | Privacy and redaction review | Consumer |
| --- | --- | --- | --- | --- |
| `/public/marketing/source-cards/movies.webp` | A movie watchlist can live beside other saved things. | Original local vector artwork, created for Marka; no external license required. | Uses invented title and shapes; contains no account or personal data. | `SourceLibraryAnimation` |
| `/public/marketing/source-cards/wishlist.webp` | An e-commerce wishlist is useful library material. | Original local vector artwork, created for Marka; no external license required. | Uses invented product shapes; contains no account or personal data. | `SourceLibraryAnimation` |
| `/public/marketing/source-cards/places.webp` | Saved places and stays can be found again. | Original local vector artwork, created for Marka; no external license required. | Uses a drawn map and invented place title; contains no address or personal data. | `SourceLibraryAnimation` |
| `/public/marketing/source-cards/career.webp` | A career tip can retain its useful context. | Original local vector artwork and copy, created for Marka; no external license required. | Uses a geometric avatar and invented quotation; no real person or social post. | `SourceLibraryAnimation` |
| `/public/marketing/source-cards/engineering.webp` | Technical reading belongs in the same searchable library. | Original local vector artwork and copy, created for Marka; no external license required. | Uses invented article copy and decorative lines; no real account or post. | `SourceLibraryAnimation` |
| `/public/marketing/source-cards/ui-reference.webp` | A visual interface reference is worth keeping. | Original local vector artwork, created for Marka; no external license required. | Uses a drawn wireframe with no real application screenshot. | `SourceLibraryAnimation` |
| `/public/marketing/source-cards/course-material.webp` | Course PDFs and slides can sit beside links and images. | Original local vector artwork and copy, created for Marka; no external license required. | Uses an invented course title; no student or university record. | `SourceLibraryAnimation` |
| `/public/marketing/posters/save-from-anywhere.webp` | Placeholder illustration for a future saving demonstration. | Original local vector artwork, created for Marka; no external license required. | Illustrative UI only; it is not a frame from a product recording. | `DemoGallery` pending reviewed video |
| `/public/marketing/posters/keep-the-context.webp` | Placeholder illustration for a future saved-item context demonstration. | Original local vector artwork, created for Marka; no external license required. | Illustrative UI only; it is not a frame from a product recording. | `DemoGallery` pending reviewed video |
| `/public/marketing/posters/rediscover-it.webp` | Placeholder illustration for a future rediscovery demonstration. | Original local vector artwork, created for Marka; no external license required. | Illustrative UI only; it is not a frame from a product recording. | `DemoGallery` pending reviewed video |
| `/public/marketing/posters/mobile-library.webp` | Placeholder illustration for a future mobile library demonstration. | Original local vector artwork, created for Marka; no external license required. | Illustrative UI only; it is not a frame from a product recording. | `MobileLibraryDemo` pending reviewed video |

## Existing Marka identity assets

These existing local brand files remain unchanged. The social image is reserved for website social metadata and is not the hero product preview.

| Asset | Intended message and source type | Creator and rights | Privacy and redaction review | Dimensions and consumer |
| --- | --- | --- | --- | --- |
| `../public/brand/marka/marka-wordmark-navy.png` | Marka wordmark for light page surfaces. | Existing repo-maintained Marka brand export. | Used as supplied; no new data added. | 510 × 135; `SiteHeader` |
| `../public/brand/marka/marka-wordmark-white.png` | Marka wordmark for dark page surfaces. | Existing repo-maintained Marka brand export. | Used as supplied; no new data added. | 510 × 135; `SiteHeader` |
| `../public/brand/marka/marka-icon.png` | Marka icon for favicon and app identity. | Existing repo-maintained Marka brand export. | Used as supplied; no new data added. | 512 × 512; `BaseLayout` |
| `../public/brand/marka/marka-social.png` | Marka social preview artwork. | Existing repo-maintained Marka brand export. | Used unchanged and only as a metadata image; it is not repurposed as the hero screenshot. | 1200 × 630; `BaseLayout` Open Graph and Twitter metadata |

## Capture assets pending owner review

The repository does not contain an approved full-resolution Marka product screenshot or the owner's real-library recordings. Do not substitute inherited screenshots, production-library data, or invented video footage. Capture into these paths only after the owner has reviewed the visible content.

| Reserved asset | Message and source type | Creator and rights | Required privacy review | Target size, duration, and consumer |
| --- | --- | --- | --- | --- |
| `/public/marketing/previews/marka-desktop-library.webp` | Full desktop view of a curated Marka library, with useful cards, tags, and visual context. | Owner-provided or owner-approved local capture of a non-private demo library. | Confirm no personal library records, names, email addresses, account data, browser tabs, notifications, or secrets. Keep the complete image intact. | Target at least 2400 × 1500; `ProductCanvas` |
| `/public/marketing/demos/save-from-anywhere.mp4` | Show one useful link or file being saved into Marka. | Owner recording from a reviewed library; ownership remains with the recording owner. | Inspect every frame, both ends, metadata, audio track, cursor path, tabs, notifications, accounts, and sensitive text. Export silent and muted. | 8 to 18 seconds; `DemoGallery` |
| `/public/marketing/demos/keep-the-context.mp4` | Show the saved item's title, preview, tags, readable content, or summary where available. | Owner recording from a reviewed library; ownership remains with the recording owner. | Same frame-by-frame, metadata, audio, and redaction review as above. Export silent and muted. | 8 to 18 seconds; `DemoGallery` |
| `/public/marketing/demos/rediscover-it.mp4` | Show a saved item being found later through browsing, search, or Reader View. | Owner recording from a reviewed library; ownership remains with the recording owner. | Same frame-by-frame, metadata, audio, and redaction review as above. Export silent and muted. | 8 to 18 seconds; `DemoGallery` |
| `/public/marketing/demos/mobile-library.mp4` | Show the mixed library in Marka's mobile PWA view. | Owner recording from a reviewed library; ownership remains with the recording owner. | Same frame-by-frame, metadata, audio, and redaction review as above. Export silent and muted. | 8 to 15 seconds; `MobileLibraryDemo` |

Replace each placeholder poster with a reviewed frame or owner-approved derivative from its final recording. The desktop clips and mobile loop should total 45 to 75 seconds. Until then, playback remains unavailable and the illustrations must be labeled as placeholders.

## Public output verification

Run `pnpm --filter @karakeep/landing build` followed by `pnpm --filter @karakeep/landing verify` for local verification. Without `MARKA_LANDING_SITE_ORIGIN`, the build uses `http://localhost:4321/`, marks itself `noindex`, and the verifier allows the documented pending screenshot and recordings.

A release build must provide the approved public origin explicitly and set `MARKA_LANDING_RELEASE=1` for both build and verification. Release verification requires HTTPS, the reviewed desktop product capture, all four reviewed silent videos, their local posters, and a matching canonical URL, social metadata, robots file, and sitemap. It fails while any capture is still pending.
