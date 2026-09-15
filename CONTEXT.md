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
