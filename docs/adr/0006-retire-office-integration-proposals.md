# Retire Office integration proposals

Status: accepted

## Context

Issues #72, #73, and #74 proposed a new Office ingestion pipeline, a
provider-backed Office View, and Office editing with save-back. They were
created as a possible extension of the file-support roadmap, not as existing
product commitments. The current product direction only needs supported
images, PDFs, Markdown or plain text, and the already-delivered media paths.

Office ingestion would require format parsing, derived representations,
provider security, deployment configuration, and durable editing semantics.
That complexity is outside the current Marka product boundary and would also
make the Reader View contract less clear.

## Decision

Retire Office ingestion, Office View, and Office editing from the active Marka
roadmap. Close #72, #73, and #74 as not planned, preserving their issue
descriptions and a closure comment for historical context. Remove their nodes
and dependency arrows from the authored roadmap and generated artifacts.

Issue #75 remains a separate collaboration-permissions proposal, but it must
not depend on Office editing or promise Office asset editing. Generic raw
attachments, if accepted by another path, do not constitute first-class Office
support. Reconsidering Office work requires a new product decision and a new
scope review rather than reopening these proposals implicitly.

## Consequences

The content contract stays focused on the supported bookmark types and their
dedicated viewing surfaces. The roadmap no longer presents canceled work as a
future dependency, while GitHub retains the detailed proposals for reference.
Existing PDFs, Markdown or plain text, images, video, and audio are unaffected.
