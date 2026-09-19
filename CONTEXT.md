# Marka Content Context

This glossary defines the content terms used by Marka's bookmark library and its focused viewing surfaces.

## Content model

**Bookmark type**:
A top-level classification of a bookmark as a link, text, asset, or unknown content.
_Avoid_: making media or Office files separate top-level bookmark types.

**Asset subtype**:
The format-specific classification of an asset bookmark, such as image, PDF, video, or audio.
_Avoid_: treating an asset subtype as a new bookmark type.

**Text format**:
The authoring format of a text bookmark, either Markdown or plain text.
_Avoid_: assuming every text bookmark is Markdown.

**Bookmark content**:
The canonical saved body of a bookmark. For shared editing, this means the Markdown or plain-text body, not bookmark metadata or personal state.
_Avoid_: using content to mean title, note, tags, list membership, or owner controls.

**List role**:
A user's permission to view a list, change its bookmark membership, or manage the list. A list editor does not automatically become a bookmark content editor.
_Avoid_: treating list editor and content editor as synonyms.

**Content editor**:
A user with a distinct capability to edit shared bookmark content. This capability does not imply permission to change metadata, list membership, or delete the bookmark.
_Avoid_: using editor without specifying whether it means a list editor or content editor.

**Shared content editing**:
Non-realtime editing of one canonical bookmark body. Multiple users may work on local drafts concurrently, but a stale save requires an explicit conflict decision.
_Avoid_: calling this Google Docs-style realtime collaboration.

**Content edit grant**:
An explicit named permission on one bookmark, controlled only by the bookmark owner. It grants permission to edit the bookmark body, not permission to view the bookmark or change any other bookmark state.
_Avoid_: deriving content edit permission from list ownership, list editor role, or public access.

**Effective content access**:
A user can edit shared content only when they have both an active content edit grant and a current authenticated view path through a manual shared list. Recursive manual-list access counts; public and smart-list access do not. If every qualifying view path is lost, the grant is dormant and must be granted again after access is restored.
_Avoid_: treating a historical grant as permanently active after list access is revoked and restored.

**Content edit conflict**:
A stale save whose local draft was based on an older canonical text revision. The user must explicitly keep their draft or use the server version; v1 does not merge drafts automatically.
_Avoid_: silently applying last-write-wins or implying realtime co-editing.

**Highlight**:
An annotation attached to a selected span of saved bookmark content, optionally with a color or note.
_Avoid_: treating a highlight as a separate bookmark.

**Reading progress**:
A user's saved place in Reader View, indicating how far they have read through a bookmark.
_Avoid_: treating progress as a property of the bookmark content itself.

**Highlight recovery**:
The conservative process of reconnecting a saved highlight to changed bookmark content using its text and surrounding context.
_Avoid_: silently relocating or deleting a highlight when its match is ambiguous or missing.

**Reader outline**:
A nested table of contents built from h2 through h4 headings inside Reader View content, excluding the surrounding page title.
_Avoid_: treating the outline as a second navigation hierarchy for the dashboard shell.

**In-article search**:
A literal, case-insensitive search over the rendered Reader View content, with current-match navigation and focus restoration.
_Avoid_: implying regex or fuzzy search, or searching the reader toolbar and highlights sidebar.

## Viewing surfaces

**Preview**:
The general bookmark surface that selects the appropriate viewer for links, text, images, PDFs, video, and audio.
_Avoid_: using Preview and Reader View as synonyms.

**Reader View**:
A focused, read-only surface for readable cached HTML, Markdown, and plain-text content.
_Avoid_: using Reader View for binary media or Office editing.

**Reader-safe HTML**:
HTML that preserves readable structure and permitted media without active behavior or untrusted embedded content.
_Avoid_: treating saved or crawled HTML as trusted markup.

**Office files (out of scope)**:
Office ingestion, provider-backed viewing, and editing are canceled from Marka's active product scope. Generic raw attachments, if accepted by a separate path, do not imply document support.
_Avoid_: reopening the retired Office proposals by referring to them as an available or planned viewer.
