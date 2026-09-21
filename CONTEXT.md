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

## AI enrichment and media

**AI tag**:
A tag attached automatically by Marka's enrichment process. AI tags may be replaced when a bookmark is re-tagged, while the underlying tag and any human attachment remain intact.
_Avoid_: treating an AI tag as a human-authored classification.

**Human tag**:
A tag attached or maintained by a user. Automatic re-tagging must not remove or rewrite a human tag.
_Avoid_: using manual tag to mean a tag that was merely created by a user but later attached by automation.

**Canonical tag**:
An existing user tag that represents a reusable concept in the user's tag vocabulary. Enrichment should reuse a canonical tag when it fits instead of creating a synonym.
_Avoid_: treating a similar-bookmark suggestion as an authoritative tag.

**Source transcript**:
The provider-derived transcript or caption content preserved for provenance and recovery. It is not the same as the user's editable transcript.
_Avoid_: calling the generated summary a transcript.

**Working transcript**:
The transcript text currently used for reading, highlights, and transcript-based summaries. It may be edited by the user without destroying the source transcript.
_Avoid_: overwriting the source transcript when editing the working transcript.

**Canonical summary**:
The one user-facing summary for a bookmark, regardless of whether its input is webpage content or a transcript.
_Avoid_: creating separate webpage and transcript summaries for the same bookmark.

**Summary language**:
The requested output language for a canonical summary. It may differ from the language used for AI tags and does not require translating the working transcript.
_Avoid_: assuming the summary must use the source language.

**Semantic embedding**:
A vector representation used to compare bookmark meaning for related-tag suggestions and semantic retrieval. It is distinct from generated text, tags, and summaries.
_Avoid_: calling an embedding an AI summary or a chat response.

## Release and deployment model

**Release**:
A SemVer identity for one compatible web and workers product pair, represented by an immutable annotated Git tag. A release is distinct from package manifest versions.
_Avoid_: treating an SDK, MCP, mobile, extension, or other package version as the shared product release.

**Build**:
A deployable web or workers artifact produced from one source commit. A release has paired builds, but a build is not itself a release or a deployment.
_Avoid_: using build, release, and deployment interchangeably.

**Release channel**:
A mutable pair of deployment references intended to resolve to the same release. `stable` is the only supported channel for this scope.
_Avoid_: treating a channel pointer as an immutable rollback reference.

**Deployment**:
The web and workers services currently running for an installation. Services may roll forward independently, so adjacent builds must remain compatible during a channel update.
_Avoid_: assuming that promoting a channel changes every service atomically.

**Release provenance**:
The metadata that identifies a running build precisely, including its release identity and source commit, with image-level evidence available for operator verification.
_Avoid_: treating a short commit display or a mutable channel name as sufficient exact provenance.

**Rollback artifact**:
An immutable, paired web and workers image reference that can restore a known-good deployment. Version-tagged artifacts are the preferred human-readable choice; SHA-tagged artifacts remain available as a fallback.
_Avoid_: rolling back only one service or relying on a mutable channel pointer.

**GitHub Release**:
A human-facing publication associated with one immutable Git tag. It explains a release and may contain generated or edited notes, but it does not define the release identity or replace image provenance.
_Avoid_: treating a GitHub Release page as the source of truth instead of its Git tag and source commit.

**Eligible release commit**:
A source commit that is reachable from `main` and has a successful exact-commit CI result for the repository's blocking checks. A tag on an eligible commit may enter the release workflow.
_Avoid_: accepting the latest branch result, an unrelated successful run, or advisory-only checks as release eligibility.

**Release compatibility window**:
The bounded period while independently updated web and workers services overlap during a channel rollout. Both adjacent releases must remain compatible throughout this window.
_Avoid_: describing an independently rolled deployment as an atomic switch.

**Build identity**:
The full source commit that uniquely identifies a deployable build. A release number is useful for human communication, but the build identity is the value used to determine whether two running or cached builds are actually different.
_Avoid_: using a release number alone as a cache, service-worker, or rollback identity.

**Compatibility version field**:
The existing server-version response field retained for clients that only understand a commit string. It remains a full commit when available; newer clients use structured release metadata alongside it.
_Avoid_: changing the legacy field from a commit identity to a release number without a compatibility layer.
