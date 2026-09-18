# Shared bookmark content editing and concurrency boundary

**Status: accepted**

Marka separates shared bookmark content editing from list membership permissions. In the first version, authorized users edit the single Markdown or plain-text body globally across every list containing the bookmark. This is not Google Docs-style realtime collaboration: each user may work on a local draft and save against a canonical revision, while stale saves become explicit conflicts instead of silently overwriting another person's work. Metadata, personal bookmark state, list membership, deletion, highlights, transcripts, and reading progress remain outside this capability.

## Considered Options

- **Realtime collaborative editing:** deferred because it requires presence, synchronization, merge semantics, and a substantially larger failure surface.
- **Last-write-wins:** rejected because a later save could silently discard another editor's content.
- **Version-checked explicit saves:** accepted because it permits concurrent drafting while preserving both values when saves race.

## Consequences

The product needs a clear stale-save conflict flow. The first editor whose revision matches the canonical body can save; another editor with a stale draft must explicitly keep the local draft or accept the server value. Automatic text merging can be considered later, especially for Markdown.
