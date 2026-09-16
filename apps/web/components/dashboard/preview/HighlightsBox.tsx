import { Fragment } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import { useTranslation } from "@/lib/i18n/client";
import { useQuery } from "@tanstack/react-query";
import { ChevronsDownUp } from "lucide-react";

import { useTRPC } from "@karakeep/shared-react/trpc";

import HighlightCard from "../highlights/HighlightCard";

export default function HighlightsBox({
  bookmarkId,
  readOnly,
}: {
  bookmarkId: string;
  readOnly: boolean;
}) {
  const api = useTRPC();
  const { t } = useTranslation();

  const { data: highlights, isPending: isLoading } = useQuery(
    api.highlights.getForBookmark.queryOptions({ bookmarkId }),
  );

  if (isLoading || !highlights || highlights?.highlights.length === 0) {
    return null;
  }

  return (
    <Collapsible defaultOpen={true}>
      <div className="w-full">
        <CollapsibleTrigger className="flex w-full items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-foreground">
              {t("common.highlights")}
            </p>
            <p className="text-xs text-muted-foreground">
              {highlights.highlights.length} saved passage
              {highlights.highlights.length === 1 ? "" : "s"}
            </p>
          </div>
          <ChevronsDownUp className="size-4 text-muted-foreground" />
        </CollapsibleTrigger>
        <CollapsibleContent className="group mt-3 flex flex-col text-sm">
          {highlights.highlights.map((highlight) => (
            <Fragment key={highlight.id}>
              <HighlightCard
                highlight={highlight}
                clickable
                readOnly={readOnly}
              />
              <Separator className="my-3 last:hidden" />
            </Fragment>
          ))}
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
