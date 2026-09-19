# Bookmark-level shared content permission grants

**Status: accepted**

Marka grants shared bookmark-body editing to named users at the bookmark level. The bookmark owner controls these grants. A grant is usable only while the recipient has a current authenticated view path through a manual shared list containing the bookmark. Recursive manual-list access counts, while public and smart-list access do not. List roles and content-edit grants remain independent: a list editor does not automatically edit bookmark content, and a list viewer may edit content when explicitly granted.

When the recipient loses every qualifying view path, the grant becomes inactive and must be granted again after access is restored. The owner continues to control metadata, personal state, tags, assets, list membership, deletion, highlights, transcripts, and reading progress. The grant applies globally to the one canonical Markdown or plain-text body across every list containing the bookmark.

## Considered options

- **Derive editing from the list editor role:** rejected because list membership management and bookmark-body editing are different capabilities.
- **Make the permission list-scoped:** rejected because it would create divergent bookmark bodies and make multi-list behavior surprising.
- **Keep grants active after access is revoked and restored:** rejected because a new share should require an intentional new grant.
- **Grant by email or public link:** rejected because v1 names existing users who already have authenticated manual-list access.

## Consequences

The server must evaluate both the explicit grant and current manual-list view access for every body mutation. The owner UI needs a bookmark-level Shared content surface that lists current editors and eligible viewers. Revoking the last view path invalidates the grant, and the UI must communicate that list-editor status alone does not confer body-editing permission.
