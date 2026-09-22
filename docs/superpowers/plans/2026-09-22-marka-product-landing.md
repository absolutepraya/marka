# Marka Product Landing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Replace the inherited Karakeep marketing site with a truthful, product-led Marka landing page that explains Marka in seconds and leads visitors to see the product or create an account.

**Architecture:** Keep Astro responsible for the durable marketing document, metadata, and static product composition. Isolate only the two genuinely interactive pieces, the curated source-library animation and user-controlled demo gallery, as small React islands. Store all landing copy and asset references in one typed content module. Treat recordings and screenshots as a reviewed marketing-asset manifest, not application data.

**Tech Stack:** Astro 7, React 19 islands, TypeScript, Tailwind CSS, Vitest, Node node:test, static HTML inspection, existing Marka brand assets.

**Spec:** [2026-09-22-marka-product-landing-design.md](../specs/2026-09-22-marka-product-landing-design.md)

## Global Constraints

- Preserve the internal @karakeep/* package scopes and compatibility identifiers. They are not public branding.
- Do not retain inherited Karakeep public copy, URLs, cloud pricing, app-store links, legal claims, or Localhost Labs attribution.
- State only shipped, demonstrable capabilities. Do not promise a native mobile app, hosted service, integrations, privacy guarantees, or AI behavior that is not live and supportable.
- Use the approved positioning: “Everything you want to come back to.” Supporting copy may say “your self-hosted personal library” and “not just bookmarks.”
- The primary CTA is **See Marka in action**. The secondary CTA opens the existing account flow at https://marka.abhipraya.dev/.
- Keep the current app at marka.abhipraya.dev. marka.ing may become the landing canonical URL only after ownership, DNS, deployment, and a public-site review are complete. A later app.marka.ing migration is a separate issue.
- Use curated, non-private demo content in the source-library animation. Use the owner’s real library only for screen recordings, with private information redacted before export.
- Respect prefers-reduced-motion, never autoplay audio, offer poster-first video loading, and retain a complete non-JavaScript static story.
- Do not hotlink third-party site media. Store reviewed derivatives locally, avoid implied endorsement, and record each asset’s source and rights/review status.

## Review Focus

- Can a visitor answer “What is Marka?” and name concrete things they would save before scrolling?
- Does the hero show the real product immediately, at desktop and mobile widths, without a generic greeting or dashboard chrome distracting from the library?
- Do all claims, links, metadata, structured data, robots, sitemap, source image assets, videos, and CTA destinations describe Marka rather than inherited Karakeep?
- Do motion, video, and reduced-motion fallbacks preserve the same story without hiding important meaning?
- Does the output verifier prove there are no stale public Karakeep references or broken local media links?

## File Structure

    apps/landing/
    ├── package.json                              # landing test and verification scripts
    ├── vitest.config.ts                          # jsdom + TypeScript test configuration
    ├── scripts/
    │   ├── verify-public-site.mjs                # scans built public output and local asset links
    │   └── verify-public-site.test.mjs           # fixture tests for the output verifier
    ├── public/
    │   ├── brand/marka/                          # existing generated canonical brand assets
    │   └── marketing/
    │       ├── README.md                         # asset provenance and redaction manifest
    │       ├── previews/marka-desktop-library.webp
    │       ├── source-cards/*.webp
    │       ├── demos/*.mp4
    │       └── posters/*.webp
    └── src/
        ├── content/landing.ts                    # typed copy, cards, demos, and CTA destinations
        ├── content/landing.test.ts               # content completeness and public-claim tests
        ├── layouts/BaseLayout.astro              # Marka metadata, canonical URL, social preview
        ├── pages/index.astro                     # public composition of the single landing page
        ├── pages/robots.txt.ts                   # public crawler policy
        ├── pages/sitemap-index.xml.ts            # public sitemap policy
        ├── components/
        │   ├── MarkaHero.astro                   # centered promise and desktop product canvas
        │   ├── ProductCanvas.astro               # static full-resolution product preview
        │   ├── SourceLibraryAnimation.tsx        # progressive-enhancement source card animation
        │   ├── SourceLibraryAnimation.test.tsx
        │   ├── DemoGallery.tsx                   # deliberate short desktop demos
        │   ├── DemoGallery.test.tsx
        │   ├── MobileLibraryDemo.tsx             # silent phone-frame PWA loop
        │   ├── MobileLibraryDemo.test.tsx
        │   ├── OwnershipClose.astro              # self-hosted ownership close and CTAs
        │   └── Footer.astro                      # truthful minimal footer
        └── styles/global.css                     # landing tokens, responsive composition, motion rules

## Task 1: Build the reviewed marketing-asset manifest

**Files:**
- Create: apps/landing/public/marketing/README.md
- Add: apps/landing/public/marketing/previews/marka-desktop-library.webp
- Add: apps/landing/public/marketing/source-cards/{movies,wishlist,places,career,engineering,ui-reference,course-material}.webp
- Add: apps/landing/public/marketing/demos/{save-from-anywhere,keep-the-context,rediscover-it,mobile-library}.mp4
- Add: apps/landing/public/marketing/posters/{save-from-anywhere,keep-the-context,rediscover-it,mobile-library}.webp

- [ ] Define the exact intended message, source type, creator, redaction check, license or creation status, dimensions, and consuming component for each asset in public/marketing/README.md.
- [ ] Capture one high-resolution desktop library preview that makes bookmark cards, visual context, tags, and browsing legible without reading the UI chrome.
- [ ] Produce seven curated source-card derivatives representing: Rotten Tomatoes or IMDb watchlists, e-commerce wishlists, TikTok places or hotels, Instagram career tips, engineering articles, UI references, and course PDFs or presentations.
- [ ] Record four silent, muted exports: three 8 to 18 second desktop clips for saving, context, and rediscovery, plus one 8 to 15 second mobile PWA loop. Keep the combined duration between 45 and 75 seconds.
- [ ] Record real-library demonstrations with Screen Studio, Loom, Cap, or an equivalent tool. Use motion such as cursor focus, automatic zoom, and speed-up only to clarify the action.
- [ ] Redact accounts, people, saved private content, tokens, addresses, browser tabs, and notifications. Review the first frame, last frame, metadata, audio track, and every accelerated transition before committing assets.
- [ ] Convert assets to the listed web-ready formats and sizes. Ensure each clip has a poster image and does not use a third-party URL at runtime.

## Task 2: Establish a typed landing content contract with tests

**Files:**
- Create: apps/landing/src/content/landing.ts
- Create: apps/landing/src/content/landing.test.ts
- Modify: apps/landing/package.json
- Create: apps/landing/vitest.config.ts

- [ ] Write the failing Vitest assertions for the positioning, CTA destinations, seven source categories, three desktop demos, one mobile demo, local asset paths, and no unsupported claims.

    import { describe, expect, it } from "vitest";
    import { landing } from "./landing";

    describe("landing content", () => {
      it("keeps the product promise and public paths complete", () => {
        expect(landing.hero.title).toBe("Everything you want to come back to.");
        expect(landing.primaryCta.href).toBe("#demos");
        expect(landing.sourceCards).toHaveLength(7);
        expect(landing.demos.desktop).toHaveLength(3);
        expect(landing.demos.mobile.poster).toMatch(/^\/marketing\/posters\//);
      });
    });

- [ ] Add vitest, @testing-library/react, @testing-library/user-event, jsdom, and vite-tsconfig-paths at versions compatible with the monorepo’s existing test tooling. Add test and verify package scripts.
- [ ] Implement typed records for hero, primaryCta, secondaryCta, sourceCards, demos, and ownership. Keep every public string and local public path in this module.
- [ ] Include familiar examples in the content contract: movie watchlists, e-commerce wishlists, places, career posts, engineering reading, UI references, and course material.
- [ ] Make external-page navigation explicit through typed href values. Point account creation to https://marka.abhipraya.dev/; keep the primary CTA as the in-page #demos anchor.
- [ ] Run pnpm --filter @karakeep/landing test and confirm the assertions pass.
- [ ] Commit the test foundation and content contract: test(landing): establish public content contract.

## Task 3: Replace inherited public shell, routes, and metadata

**Files:**
- Modify: apps/landing/src/layouts/BaseLayout.astro
- Modify: apps/landing/src/pages/index.astro
- Modify: apps/landing/src/constants.ts
- Modify: apps/landing/src/styles/global.css
- Create: apps/landing/src/pages/robots.txt.ts
- Create: apps/landing/src/pages/sitemap-index.xml.ts
- Delete: apps/landing/src/pages/{apps,pricing,privacy,terms}.astro
- Delete: apps/landing/src/{Apps,Homepage,Navbar,Pricing,Privacy,Terms}.tsx
- Delete: inherited Banner, CallToAction, FeaturesGrid, FeatureShowcase, Hero, OpenSource, and Platforms components when they are no longer imported

- [ ] Search first for all inherited public references so the removal list is evidence-based:

    rg -n -i "karakeep|localhost labs|cloud\.karakeep|try\.karakeep|app store|google play" apps/landing/src apps/landing/public

- [ ] Write a failing output-verifier fixture that contains an inherited Karakeep URL and expects a failure.
- [ ] Make BaseLayout.astro consume the typed content contract for page title, description, canonical URL, Open Graph, Twitter, and JSON-LD metadata. Use the existing /brand/marka/marka-social.png social asset.
- [ ] Set the canonical origin through one deliberate site-origin configuration. Until marka.ing is owned and deployed, use a non-production preview origin only in local builds and do not publish it. At launch, set https://marka.ing/ in Astro site configuration, canonical tags, JSON-LD, sitemap, and robots only together.
- [ ] Replace the inherited multi-page marketing navigation with a simple logo link and a visible **See Marka in action** CTA. Do not create pricing, legal, cloud, mobile-app, or third-party social pages without reviewed content.
- [ ] Remove stale routes and unused inherited components. Replace footer content with an accurate Marka identity, repository link, and current app link.
- [ ] Add a single-page sitemap and robots policy that reference only the reviewed public landing origin.
- [ ] Run pnpm --filter @karakeep/landing lint, pnpm --filter @karakeep/landing typecheck, and the targeted tests. Commit: feat(landing): replace inherited public shell.

## Task 4: Build the static product-first narrative

**Files:**
- Create: apps/landing/src/components/MarkaHero.astro
- Create: apps/landing/src/components/ProductCanvas.astro
- Create: apps/landing/src/components/OwnershipClose.astro
- Modify: apps/landing/src/pages/index.astro
- Modify: apps/landing/src/styles/global.css

- [ ] Compose the page in this fixed semantic order: hero, desktop product canvas, source-library section, desktop demos, mobile loop, ownership close, footer.
- [ ] Give the hero a centered promise, a compact supporting explanation, the primary in-page CTA, and the account CTA. Do not show a greeting, personalized name, fake metrics, signup urgency, or decorative dashboard shell.
- [ ] Make the desktop product preview full-width and high-resolution under the hero. Use a responsive picture or image with an honest, descriptive alt value.
- [ ] Write static source-library fallbacks below the product preview. A reader without JavaScript must still see the seven recognizable items and the explanation that Marka preserves title, preview, tags, readable content, and summaries where available.
- [ ] Close with an ownership statement that is accurate to the public self-hosted product, then repeat both CTAs.
- [ ] Verify at 320px, 768px, 1280px, and 1440px that text wraps intentionally, full preview details remain legible, CTAs remain easy to reach, and no content is horizontal-scroll clipped.
- [ ] Commit: feat(landing): add product-first static narrative.

## Task 5: Add the curated source-library motion as progressive enhancement

**Files:**
- Create: apps/landing/src/components/SourceLibraryAnimation.tsx
- Create: apps/landing/src/components/SourceLibraryAnimation.test.tsx
- Modify: apps/landing/src/pages/index.astro
- Modify: apps/landing/src/styles/global.css

- [ ] Write a failing component test that renders seven labeled source cards, does not depend on autoplayed video, and exposes an accessible section label.

    it("keeps the source-library story available without animation", () => {
      render(<SourceLibraryAnimation cards={landing.sourceCards} />);
      expect(screen.getByRole("region", { name: /from scattered saves to marka/i })).toBeVisible();
      expect(screen.getByText(/movie watchlist/i)).toBeVisible();
      expect(screen.getByText(/course material/i)).toBeVisible();
    });

- [ ] Implement a small client-visible React island where familiar source cards enter from varied directions and settle into a calm Marka library arrangement. Use transforms and opacity only, cap duration, and do not loop distractingly.
- [ ] Start the animation only when the section is visible. If scripting fails or motion is reduced, show the complete static arranged-card layout immediately.
- [ ] Make each card visible enough to convey source type with its selected logo or preview derivative, a textual label, and alt text. Do not present any third-party logo as an integration or endorsement.
- [ ] Keep the final settled arrangement stable so it reads as a library, not a decorative carousel.
- [ ] Run component tests with and without a mocked reduced-motion media query. Commit: feat(landing): animate the unified library story.

## Task 6: Implement short, visitor-controlled desktop demo clips

**Files:**
- Create: apps/landing/src/components/DemoGallery.tsx
- Create: apps/landing/src/components/DemoGallery.test.tsx
- Modify: apps/landing/src/pages/index.astro
- Modify: apps/landing/src/styles/global.css

- [ ] Write failing tests that verify the three demo titles, video posters, captions, buttons, closed captions or transcript links where audio is present, and no automatic audio playback.
- [ ] Implement three clearly separated clips:
  1. **Save from anywhere**: save a link or file into the library.
  2. **Keep the context**: show preview, readable content, tags, or a summary without reopening every source.
  3. **Rediscover it**: browse or search visual memory later.
- [ ] Use poster-first video elements with muted, inline, metadata-preload behavior that only play when a visitor explicitly chooses play. A visible play control must work with keyboard and screen reader labels.
- [ ] Add a short one-sentence caption under each clip, with content that matches the actual recording. Keep recording UI and visual pacing polished, but never hide the task being demonstrated.
- [ ] Ensure only one desktop demo plays at a time and pause playback when a clip leaves the viewport.
- [ ] Run Vitest, then manually test keyboard play/pause, mobile tap, and reduced-motion behavior. Commit: feat(landing): demonstrate saving context and rediscovery.

## Task 7: Add the mobile PWA visual-library loop

**Files:**
- Create: apps/landing/src/components/MobileLibraryDemo.tsx
- Create: apps/landing/src/components/MobileLibraryDemo.test.tsx
- Modify: apps/landing/src/pages/index.astro
- Modify: apps/landing/src/styles/global.css

- [ ] Write failing tests for the phone frame label, poster, muted loop configuration, reduced-motion fallback, and absence of installation or app-store claims.
- [ ] Render one short silent mobile library loop in a phone frame after the desktop demos. The loop may auto-play only while in view, is muted, pauses outside the viewport, and falls back to the poster under reduced motion.
- [ ] Describe the visual as access to the library on mobile, not as a native app, app-store product, or installation promise.
- [ ] Use object-fit and responsive framing that makes the phone intentional at narrow and wide breakpoints without competing with the desktop hero.
- [ ] Run component tests and manual mobile browser checks. Commit: feat(landing): show Marka on mobile.

## Task 8: Verify public output and stop stale branding from returning

**Files:**
- Create: apps/landing/scripts/verify-public-site.mjs
- Create: apps/landing/scripts/verify-public-site.test.mjs
- Modify: apps/landing/package.json
- Modify: apps/landing/public/marketing/README.md

- [ ] Write red tests for each public-output failure mode: banned inherited branding, unsupported cloud or app-store URLs, absent social image, non-local media URL, missing local media target, and canonical-origin mismatch.
- [ ] Implement a Node verifier that recursively examines dist after astro build. Fail on the exact inherited strings named in Global Constraints and validate public URL, social asset, robots, sitemap, videos, posters, and source cards.

    const forbidden = [
      "karakeep.app",
      "cloud.karakeep.app",
      "try.karakeep.app",
      "localhostlabs.co.uk",
      "apps.apple.com",
      "play.google.com",
    ];

- [ ] Require an intentional release environment value for the canonical origin. Allow a clearly marked local-development origin only when not building a release artifact.
- [ ] Run the verifier against controlled fixtures, then pnpm --filter @karakeep/landing build followed by pnpm --filter @karakeep/landing verify.
- [ ] Run rg -n -i "karakeep|localhost labs|cloud\.karakeep|try\.karakeep|app store|google play" apps/landing and resolve every public result deliberately.
- [ ] Commit: test(landing): verify public Marka output.

## Task 9: Perform a visual, accessibility, and release-readiness review

**Files:**
- Modify only files whose review evidence exposes a defect
- Update: apps/landing/public/marketing/README.md if an asset is replaced or re-reviewed

- [ ] Build the landing package and inspect the output at 320px, 768px, 1280px, and 1440px in light and dark system settings if both are supported.
- [ ] Check heading sequence, landmark names, image alternatives, focus indicators, keyboard operation, video controls, contrast, network loading behavior, and no motion-only meaning.
- [ ] Validate the visual hierarchy against the approved direction: centered promise, HD product canvas, an understandable source-to-library moment, short separate demos, a restrained mobile loop, and a self-host close.
- [ ] Confirm all account CTAs resolve to the current app and the primary CTA scrolls to the demos.
- [ ] Run the full required check set:

    pnpm format:fix
    pnpm lint
    pnpm typecheck
    pnpm test
    pnpm --filter @karakeep/landing build
    pnpm --filter @karakeep/landing verify

- [ ] Commit the reviewed implementation: feat(landing): launch Marka product site.

## Task 10: Release the landing origin separately from app-domain migration

**Files:**
- Modify: deployment or hosting configuration only after explicit approval
- Update: apps/landing/public/marketing/README.md with release origin and final asset review date

- [ ] Confirm marka.ing is purchased and controlled before making any public configuration change.
- [ ] Inspect the existing landing deployment, DNS, HTTPS, redirect behavior, environment variables, and release workflow read-only. Present the smallest exact deployment and DNS diff for approval.
- [ ] Deploy the landing site to marka.ing, verify HTTPS, canonical tags, Open Graph image, JSON-LD, robots, sitemap, primary anchor CTA, account CTA, and a direct production asset load.
- [ ] Keep marka.abhipraya.dev as the app domain. Do not change app cookies, OAuth callback URLs, PWA manifest scope, CORS, service workers, or sessions in this work.
- [ ] Open a separate domain-migration issue only when the landing is live and an app-domain migration has an explicit user need, compatibility plan, rollback plan, and verified configuration inventory.

## Final Verification Checklist

- [ ] The landing gives a concrete answer to “What is Marka?” in the hero and first scroll.
- [ ] The first product visual is a crisp desktop library, not a generic dashboard greeting.
- [ ] Seven curated source examples make the cross-app problem feel real.
- [ ] Real recordings are short, divided by job, redacted, muted, and visitor-controlled.
- [ ] The mobile presentation is a visual library loop, not a store-installation pitch.
- [ ] No inherited Karakeep marketing identity survives in production output.
- [ ] No public claim exceeds what the product demonstrably supports.
- [ ] marka.ing is used only after ownership and deployment verification.
- [ ] App-domain migration is not included in this work.
