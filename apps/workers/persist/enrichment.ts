import { and, eq } from "drizzle-orm";

import { definePersist } from "@karakeep/db/persist";
import { bookmarkLinks, bookmarks } from "@karakeep/db/schema";

export type EnrichmentStatus = "tagging" | "summarization" | "embedding";

const STATUS_COLUMNS = {
  tagging: "taggingStatus",
  summarization: "summarizationStatus",
  embedding: "embeddingStatus",
} as const;

/**
 * Clears enrichment statuses still marked "pending" after a job gives up, so
 * the bookmark does not look stuck. Optionally marks a pending crawl failed.
 */
export const clearPendingEnrichment = definePersist<
  {
    bookmarkId: string;
    statuses: EnrichmentStatus[];
    failPendingCrawl?: boolean;
  },
  void
>(
  "bookmarks.clearPendingEnrichment",
  (db, { bookmarkId, statuses, failPendingCrawl }) =>
    db.transaction(async (tx) => {
      if (failPendingCrawl) {
        await tx
          .update(bookmarkLinks)
          .set({ crawlStatus: "failure" })
          .where(
            and(
              eq(bookmarkLinks.id, bookmarkId),
              eq(bookmarkLinks.crawlStatus, "pending"),
            ),
          );
      }
      for (const status of statuses) {
        const column = STATUS_COLUMNS[status];
        await tx
          .update(bookmarks)
          .set({ [column]: null })
          .where(
            and(eq(bookmarks.id, bookmarkId), eq(bookmarks[column], "pending")),
          );
      }
    }),
);
