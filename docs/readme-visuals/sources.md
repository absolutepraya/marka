# README architecture

Purpose: explain Marka's architecture in the repository README using the
canva-decking visual workflow and Marka's navy palette.

Source content:

- `README.md`, How it works: clients, application processes, shared storage,
  search, rendering, and optional AI.
- `docs/docs/02-installation/11-guided-docker-setup.md`, Generated deployment:
  SQLite and local assets are shared by web and workers; search and rendering
  services are configurable.
- `apps/web/app/api/[[...route]]/route.ts`: Hono REST API entry point.
- `apps/workers/index.ts` and `apps/workers/workers/`: background processing.
- `assets/brand/marka/manifest.json`: approved navy `#03132F` and white palette.

Rendering:

- `src/architecture.html` is the editable source. It embeds Montserrat so it can
  render without a font installation or network access. The font's SIL Open Font
  License is recorded in `MONTSERRAT-LICENSE.txt`.
- Run `node docs/readme-visuals/render-preview.mjs` from the repository root with
  dependencies and Playwright Chromium installed. It checks text layout and
  renders the transparent `png/architecture.png` and white-background
  `png/architecture-readme.png` at 2x. A local review copy is also written to
  `png/_preview/architecture.png`.
- The README uses the white-background render so labels remain readable in both
  GitHub themes. The transparent export is available for slide use.
- `architecture.py` records the layout in Python and can rebuild the HTML when
  the author's canva-decking skill and its Montserrat font cache are installed.
  The generated HTML and normal PNG rendering do not require that skill.
- Solid arrows show requests and processing. Paired arrows show read and write
  access. The dashed card identifies optional AI, not a separate data flow.
- This is a conceptual overview. It omits queues, authentication, and responses.
