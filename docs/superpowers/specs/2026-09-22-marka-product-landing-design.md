# Marka product landing design

**Date:** 2026-09-22
**Status:** Approved design, ready for implementation planning
**Issue:** #25
**Scope:** Rebuild the existing `apps/landing` Astro site as Marka's public product landing page. The current application at `marka.abhipraya.dev` remains unchanged.

## Outcome

In the first few seconds, a visitor should understand that Marka is a self-hosted personal library for the many things they save and want to revisit, rather than a conventional browser-bookmark folder. The landing page must make that promise credible through a real high-resolution Marka product canvas, familiar curated content examples, and brief product recordings.

The page is optimized for a curious prospective user or credibility contact, such as someone who has seen the project and asks what it is. It must let that person understand the product before asking them to create an account.

## Context

`apps/landing` already exists, but it is an upstream Karakeep marketing surface. It currently contains upstream branding, public-service claims, links, structured data, canonical URLs, screenshots, and copy. It cannot be published as Marka without replacing those materials.

Marka's maintained app is currently served from `https://marka.abhipraya.dev`. The intended future public landing domain is `https://marka.ing`, contingent on the owner registering and controlling that domain. A landing launch must not force an application-domain migration.

## Product message

The approved hero message is:

> Everything you want to come back to.

Supporting copy explains that Marka gives links, places, movies, ideas, articles, screenshots, and files a visual, searchable home.

This message is deliberately broader than browser bookmarks. It should make visitors recognize their own saved material in the examples without claiming that every third-party service has a live integration.

## Information architecture

The landing page follows one product narrative rather than an exhaustive feature grid.

### 1. Product-first hero

The hero uses a centered value statement, concise explanatory copy, and two calls to action:

- Primary: `See Marka in action`. It opens or scrolls to the product-demo experience.
- Secondary: `Create an account`. Until the later application-domain migration, this links to the existing authenticated application at `https://marka.abhipraya.dev`.

A full-width, high-resolution desktop Marka preview sits immediately below the call to action. It shows a curated library with neutral useful labels such as watchlists, places to go, engineering articles, UI references, and reader content. It must not show a personalized greeting such as `Good morning, Daffa`.

The visual character is restrained, product-led, and light: centered typography, generous whitespace, a single large application canvas, and no decorative dashboard collage competing with the product preview.

### 2. Familiar saved things become one library

This section makes the non-bookmark-library promise tangible. Local, curated source cards represent examples such as:

- Rotten Tomatoes movie watchlists
- Shopee, eBay, and Tokopedia wishlists
- TikTok place and hotel collections
- Instagram career-tip posts
- software-engineering articles
- UI reference screenshots
- college-course PDFs and presentations

The section uses a progressive JavaScript animation: source cards enter from scattered positions and settle into a coherent Marka-library composition. It runs once when the section first becomes visible, then remains in a stable readable state. The final stable composition is the experience for reduced-motion visitors and browsers without JavaScript.

The site must use local curated assets and source labels only. It must not fetch, frame, crawl, or display live third-party posts. Public preview images must be original, rights-cleared, or otherwise approved for public use. A source name is contextual labeling, not a claim of partnership or live integration.

### 3. Three proof clips

This section presents three short, user-triggered desktop recordings. Each recording has a poster image, clear caption, native controls, and a duration of roughly 6 to 15 seconds.

1. **Save from anywhere:** capture one useful item into Marka.
2. **Keep the context:** show the resulting visual preview, title, tags, readable content, or summary.
3. **Rediscover it:** find the item using a library view, search, or Reader View.

The clips are distinct choices rather than a mandatory long tour. They do not autoplay with sound. At most one clip can play at a time.

### 4. Mobile continuity clip

A phone frame contains a separate, muted 6 to 10 second loop. It shows the mobile PWA browsing a mixed visual library of saved items. It does not demonstrate installation flows.

This clip proves that saved material remains accessible away from a desktop. It complements the desktop demos and reinforces the same mixed-content promise.

### 5. Ownership close

The final section restates the durable benefit: saved material stays close, searchable, and under the owner's control. It includes a confident repeat of the primary `See Marka in action` call to action and, where appropriate, a secondary path to account creation or self-host information.

## Content and media contract

Marketing preview assets and recordings have different sources:

- **Preview illustrations and the source-library animation** use a public, curated demo library with non-sensitive content.
- **Product recordings** use the owner's real Marka library to demonstrate authentic workflows. Before publication, each capture must be reviewed for private bookmarks, personal names, email addresses, notifications, authentication state, API tokens, secrets, financial details, and private browser tabs. Any such detail must be removed, redacted, or rerecorded.

Recordings should use a Screen Studio, Loom, or Cap-style treatment: cursor-led zoom, intentionally accelerated transitions, concise captions, and no dependence on narration. The total duration across the clips should remain approximately 45 to 75 seconds, split into focused parts rather than one long video.

Videos are local public assets with appropriate poster images. They must be lazy-loaded and use an efficient web delivery format with an accessible fallback. Users can pause any motion. `prefers-reduced-motion` disables decorative card animation and prevents nonessential video auto-play.

## Technical design

The implementation stays within the existing `apps/landing` Astro package. It replaces upstream public identity, copy, links, screenshots, and discovery metadata with fork-owned Marka materials. It must not create a second marketing application.

Landing content should be represented in a small typed, data-driven configuration so the hero preview, source cards, demos, and feature copy do not drift across multiple components. Decorative animation enhances static semantic content rather than becoming the only way to understand a section.

The page uses native semantic HTML for headings, links, images, and video controls. The animation must have a stable non-animated render and must not require remote scripts or third-party client-side services.

The public landing origin is `https://marka.ing` after the domain is registered and a separately approved hosting and DNS change is complete. Before that cutover, the page may be developed and previewed locally only. No DNS, hosting, redirect, certificate, analytics, or production application configuration changes belong to this issue without an explicit approved release step.

The existing app origin, sign-in sessions, PWA scope, OAuth callbacks, browser-extension settings, CORS policy, and generated public URLs remain untouched. A later issue owns moving the app to a possible `app.marka.ing` host and must supply its own migration and rollback plan.

## Discovery and public identity

Within `apps/landing`, replace all Karakeep public metadata with Marka's approved identity:

- title, description, canonical URL, Open Graph, and social-card metadata
- structured data that describes only features and offers actually operated by the Marka fork
- robots and sitemap public origin
- visual brand assets, favicon, and social image
- navigation, footer, and calls to action
- upstream cloud, pricing, demo, app-store, extension, legal, and documentation links that this fork does not operate

The page must not claim upstream cloud plans, user counts, app-store availability, or integrations that Marka does not provide. Upstream attribution remains where it is factual and intentional.

Repository-wide README, GitHub profile metadata, topics, social preview, and repository screenshot work are intentionally outside this issue. A separate repository-presentation issue owns that work.

## Accessibility and resilience

- The page meets WCAG 2.2 AA color contrast and keyboard-operability expectations.
- Every meaningful image has accurate alternative text. Decorative images are hidden from assistive technology.
- Video clips have descriptive labels, captions or text equivalents, visible native controls, and poster states that convey the clip's subject before loading.
- Motion respects `prefers-reduced-motion`; no content or control depends on motion.
- A failed or unsupported video leaves its title, description, and poster visible, with no broken layout.
- The source-library composition remains readable and logically ordered in its static HTML form.
- Desktop and compact mobile layouts preserve all calls to action, demo controls, and essential text.

## Acceptance criteria

- [ ] The landing page identifies Marka as a self-hosted personal library rather than only a bookmark manager.
- [ ] The hero uses the approved centered statement, full high-resolution Marka desktop preview, primary demo call to action, and secondary account call to action.
- [ ] The hero's product preview uses curated neutral data and contains no personal greeting.
- [ ] The animated source-library section uses local curated assets, has a stable non-JavaScript state, and honors reduced-motion preferences.
- [ ] The source-library examples cover multiple familiar saved-content categories, including watchlists, wishlists, saved places, social posts, articles, visual references, and PDFs or presentations.
- [ ] The page provides three desktop proof clips and one separate mobile PWA clip with correct poster states, captions, controls, lazy loading, and privacy review.
- [ ] No public asset includes private library details or makes unapproved third-party service claims.
- [ ] All landing metadata, links, structured data, favicon, social images, sitemap, and robots rules describe Marka and only fork-operated services.
- [ ] Upstream cloud, pricing, demo, app-store, and social claims are removed or replaced with accurate Marka destinations.
- [ ] The current app at `marka.abhipraya.dev` remains unchanged until its dedicated migration issue is designed and approved.
- [ ] Desktop and mobile visual verification, keyboard checks, motion checks, landing build, typecheck, lint, and formatting checks pass.

## Out of scope

- Migrating the application to `app.marka.ing` or any other new host
- DNS, hosting, certificate, redirect, analytics, OAuth, CORS, or production application changes without a separately approved release step
- Browser extension, native mobile application, web-app feature, API, or backend work
- Live importing or embedding third-party content in the marketing page
- Repository README and GitHub presentation updates

## Implementation sequence

1. Produce the approved public demo data, preview illustrations, recording plan, and privacy-review checklist.
2. Replace the existing landing site's upstream identity, copy, navigation, links, and discovery metadata.
3. Implement the product-first hero and static desktop product canvas.
4. Implement the static source-library composition, then add progressive reduced-motion-safe animation.
5. Produce, redact, optimize, caption, and integrate the short desktop and mobile clips.
6. Implement the ownership close and accurate calls to action.
7. Verify accessibility, responsive behavior, media fallbacks, metadata, links, and builds locally.
8. After domain ownership is proven, prepare a separate reviewed production cutover for `marka.ing`.
