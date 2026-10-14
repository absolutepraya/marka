import { notFound } from "next/navigation";
import GlobalActions from "@/components/dashboard/GlobalActions";
import { PageHeader } from "@/components/shared/PageHeader";
import Bookmarks from "@/components/dashboard/bookmarks/Bookmarks";
import { api } from "@/server/api/client";
import { TRPCError } from "@trpc/server";

export default async function FeedPage(props: {
  params: Promise<{ feedId: string }>;
}) {
  const params = await props.params;
  let feed;
  try {
    feed = await api.feeds.get({ feedId: params.feedId });
  } catch (e) {
    if (e instanceof TRPCError) {
      if (e.code == "NOT_FOUND") {
        notFound();
      }
    }
    throw e;
  }

  return (
    <Bookmarks
      query={{ rssFeedId: feed.id }}
      showDivider={true}
      showEditorCard={false}
      header={
        <PageHeader
          title={feed.name}
          titleAction={<GlobalActions />}
          className="flex-wrap"
        />
      }
    />
  );
}
