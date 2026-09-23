import { BookmarkTypes, ZBookmark, ZBookmarkedLink } from "../types/bookmarks";
import { getAssetUrl } from "./assetUtils";

export function getBookmarkLinkAssetIdOrUrl(bookmark: ZBookmarkedLink) {
  if (bookmark.imageAssetId) {
    return { assetId: bookmark.imageAssetId, localAsset: true as const };
  }
  if (bookmark.screenshotAssetId) {
    return { assetId: bookmark.screenshotAssetId, localAsset: true as const };
  }
  return bookmark.imageUrl
    ? { url: bookmark.imageUrl, localAsset: false as const }
    : null;
}

export function getBookmarkLinkImageUrl(bookmark: ZBookmarkedLink) {
  const assetOrUrl = getBookmarkLinkAssetIdOrUrl(bookmark);
  if (!assetOrUrl) {
    return null;
  }
  if (!assetOrUrl.localAsset) {
    return assetOrUrl;
  }
  return {
    url: getAssetUrl(assetOrUrl.assetId),
    localAsset: true,
  };
}

export function isBookmarkStillCrawling(bookmark: ZBookmark) {
  if (bookmark.content.type != BookmarkTypes.LINK) {
    return false;
  }
  // crawledAt is persisted together with the core readable content and asset
  // references, before secondary inference/search/archive work finishes.
  if (bookmark.content.crawledAt) {
    return false;
  }
  if (bookmark.content.crawlStatus) {
    return bookmark.content.crawlStatus === "pending";
  }
  return true;
}

export function isBookmarkStillTagging(bookmark: ZBookmark) {
  return bookmark.taggingStatus == "pending";
}

export function isBookmarkStillSummarizing(bookmark: ZBookmark) {
  return bookmark.summarizationStatus == "pending";
}

export function isBookmarkStillLoading(bookmark: ZBookmark) {
  return isBookmarkStillCrawling(bookmark);
}

function isBookmarkEnrichmentPending(bookmark: ZBookmark) {
  return (
    bookmark.taggingStatus === "pending" ||
    bookmark.summarizationStatus === "pending"
  );
}

export function getBookmarkRefreshInterval(
  bookmark: ZBookmark,
): number | false {
  const crawlPending =
    bookmark.content.type === BookmarkTypes.LINK &&
    bookmark.content.crawlStatus === "pending";
  const enrichmentPending = isBookmarkEnrichmentPending(bookmark);
  if (
    !isBookmarkStillLoading(bookmark) &&
    !crawlPending &&
    !enrichmentPending
  ) {
    return false;
  }

  if (crawlPending || enrichmentPending) {
    // Refreshes update modifiedAt before queueing work. Use it as the bounded
    // polling anchor so old bookmarks refresh promptly too.
    const refreshStartedAt = bookmark.modifiedAt ?? bookmark.createdAt;
    const elapsed = Date.now().valueOf() - refreshStartedAt.valueOf();

    if (elapsed < 30 * 1000) {
      return 1000;
    }
    if (elapsed < 10 * 60 * 1000) {
      return 10_000;
    }
    if (elapsed < 6 * 60 * 60 * 1000) {
      return 60_000;
    }
    return false;
  }

  // For the first 30 seconds, we'll refresh the bookmark every second
  if (Date.now().valueOf() - bookmark.createdAt.valueOf() < 30 * 1000) {
    return 1000;
  }

  // Then, we'll refresh it every 10 seconds after than for 10mins
  if (Date.now().valueOf() - bookmark.createdAt.valueOf() < 10 * 60 * 1000) {
    return 10_000;
  }

  // Then, we'll refresh it every minute after than for 6hrs
  if (
    Date.now().valueOf() - bookmark.createdAt.valueOf() <
    6 * 60 * 60 * 1000
  ) {
    return 60_000;
  }

  // Then we'll stop refreshing it
  return false;
}

export function getSourceUrl(bookmark: ZBookmark) {
  if (bookmark.content.type === BookmarkTypes.LINK) {
    return bookmark.content.url;
  }
  if (bookmark.content.type === BookmarkTypes.ASSET) {
    return bookmark.content.sourceUrl ?? null;
  }
  if (bookmark.content.type === BookmarkTypes.TEXT) {
    return bookmark.content.sourceUrl ?? null;
  }
  return null;
}

export function getBookmarkTitle(bookmark: ZBookmark) {
  let title: string | null = null;
  switch (bookmark.content.type) {
    case BookmarkTypes.LINK:
      title = bookmark.content.title ?? bookmark.content.url;
      break;
    case BookmarkTypes.TEXT:
      title = null;
      break;
    case BookmarkTypes.ASSET:
      title = bookmark.content.fileName ?? null;
      break;
  }

  return bookmark.title ? bookmark.title : title;
}
