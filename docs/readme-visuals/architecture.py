"""Build the README architecture preview with the canva-decking diagram kit.

Run from the repository root:
    python3 docs/readme-visuals/architecture.py
    node docs/readme-visuals/render-preview.mjs
"""

import base64
import re
import sys
from pathlib import Path
from urllib.parse import unquote, urlparse

KIT = Path.home() / ".agents/skills/canva-decking/scripts/diagrams"
sys.path.insert(0, str(KIT))
from diagram_kit import node, path, use_theme, write  # noqa: E402

ROOT = Path(__file__).resolve().parent
use_theme(ROOT / "src/theme.css")

# White and pale cards remain readable over either GitHub page theme.
# Navy cards distinguish the two application processes from storage and services.
cards = node(16, 16, 928, 100,
             "Web / PWA · Browser extension · CLI / MCP", cls="clients", ts=24)
cards += node(16, 196, 264, 132, "Web + API", "Next.js · Hono · tRPC", "core", 25, 18)
cards += node(344, 196, 240, 132, "Shared storage", "SQLite + asset files", "storage", 23, 18)
cards += node(648, 196, 296, 132, "Background workers",
              "Crawl · Process · Index", "core", 23, 18)
cards += node(16, 456, 264, 144, "Meilisearch", "Derived search index", "service", 23, 18)
cards += node(344, 456, 280, 144, "Chrome / Browserless",
              "Page content + screenshots", "service", 21, 18)
cards += node(688, 456, 256, 144, "AI provider",
              "Tags + summaries", "service optional", 23, 18)

arrows = path("M148 118 V192")
# Separate parallel arrows keep both read and write directions unambiguous.
arrows += path("M282 248 H340") + path("M342 276 H284")
arrows += path("M586 248 H644") + path("M646 276 H588")
arrows += path("M92 330 V452")
arrows += path("M696 330 V370 H224 V452")
arrows += path("M776 330 V410 H484 V452")
arrows += path("M872 330 V452")

def caption(x, y, title, width):
    return (f'<div class="caption" style="left:{x}px;top:{y}px;'
            f'width:{width}px">{title}</div>')

cards += caption(167, 146, "Save / browse", 180)
cards += caption(106, 397, "Search", 95)
cards += caption(375, 345, "Index", 80)
cards += caption(509, 384, "Render pages", 180)
cards += caption(771, 422, "AI tasks", 90)
cards += '<span class="optional-label">OPTIONAL</span>'
cards += ('<div class="legend"><span class="legend-arrow">↔</span>'
          ' Shared read / write access'
          '<span class="legend-divider">·</span>'
          'Arrows show requests and processing</div>')

output = write(ROOT / "src/architecture", 960, 668, cards, arrows)
html = output.read_text()
css = """
.node{padding:24px!important;border:1.5px solid #b5c3d7;border-radius:18px}
.node h4{font-weight:700;letter-spacing:-.035em;line-height:1.22;color:#03132f}
.node p{line-height:1.5;color:#475770;margin-top:12px;letter-spacing:-.02em}
.node.clients{display:flex;align-items:center;justify-content:center;background:#f3f6fb}
.node.core{background:#03132f;border-color:#03132f}
.node.core h4{color:#ffffff}.node.core p{color:#ced9eb}
.node.storage{background:#eaf0f8}
.node.service{padding-top:28px!important}
.node.optional{border-style:dashed;padding-top:42px!important}
.node.optional p{margin-top:10px}
.optional-label{position:absolute;left:714px;top:472px;font-size:13px;font-weight:700;
letter-spacing:.12em;color:#62718a}
.caption{position:absolute;font-size:17px;font-weight:600;color:#03132f;line-height:1.4}
.legend{position:absolute;left:16px;top:634px;width:928px;text-align:center;
font-size:15px;font-weight:500;color:#62718a}
.legend-arrow{font-size:22px;vertical-align:-1px;color:#03132f}
.legend-divider{padding:0 16px}
svg{pointer-events:none}
"""
html = html.replace("</style>", css + "</style>")
html = html.replace(
    "<marker id=ar markerWidth=10 markerHeight=10 refX=8 refY=5 orient=auto>",
    '<marker id="ar" markerUnits="userSpaceOnUse" markerWidth="12" '
    'markerHeight="12" refX="8" refY="5" viewBox="0 0 10 10" orient="auto">',
)
html = html.replace("stroke-width=3", "stroke-width=2")
html = html.replace("<!doctype html><meta charset=utf-8>",
                    '<!doctype html><meta charset="utf-8">'
                    '<title>Marka architecture</title>'
                    '<meta name="viewport" content="width=device-width,initial-scale=1">')

# Keep the editable HTML portable without a local font install or network access.
def embed_font(match):
    font = Path(unquote(urlparse(match.group(1)).path))
    data = base64.b64encode(font.read_bytes()).decode("ascii")
    return f"url(data:font/woff2;base64,{data})"

html = re.sub(r"url\((file://[^)]+)\)", embed_font, html)
license_source = (Path.home() / ".cache/canva-decking/node_modules/"
                  "@fontsource/montserrat/LICENSE")
(ROOT / "MONTSERRAT-LICENSE.txt").write_text(license_source.read_text())
output.write_text(html)
print(output)
