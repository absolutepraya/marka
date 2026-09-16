import Link from "next/link";
import { ActionButton } from "@/components/ui/action-button";
import ActionConfirmingDialog from "@/components/ui/action-confirming-dialog";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import FilePickerButton from "@/components/ui/file-picker-button";
import { toast } from "@/components/ui/sonner";
import { ASSET_TYPE_TO_ICON } from "@/lib/attachments";
import useUpload from "@/lib/hooks/upload-file";
import { useTranslation } from "@/lib/i18n/client";
import {
  ChevronsDownUp,
  Download,
  ImagePlus,
  Paperclip,
  Pencil,
  Trash2,
} from "lucide-react";

import {
  useAttachBookmarkAsset,
  useDeleteUnattachedAsset,
  useDetachBookmarkAsset,
  useReplaceBookmarkAsset,
} from "@karakeep/shared-react/hooks/assets";
import { BookmarkTypes, ZBookmark } from "@karakeep/shared/types/bookmarks";
import { getFilePickerAccept } from "@karakeep/shared/content-support";
import { getAssetUrl } from "@karakeep/shared/utils/assetUtils";
import {
  humanFriendlyNameForAssertType,
  isAllowedToAttachAsset,
  isAllowedToDetachAsset,
} from "@karakeep/trpc/lib/attachments";

export default function AttachmentBox({
  bookmark,
  readOnly = false,
}: {
  bookmark: ZBookmark;
  readOnly?: boolean;
}) {
  const { t } = useTranslation();
  const { mutateAsync: attachAsset, isPending: isAttaching } =
    useAttachBookmarkAsset({
      onSuccess: () => {
        toast({
          description: "Attachment has been attached!",
        });
      },
      onError: (e) => {
        toast({
          description: e.message,
          variant: "destructive",
        });
      },
    });

  const { mutateAsync: replaceAsset, isPending: isReplacing } =
    useReplaceBookmarkAsset({
      onSuccess: () => {
        toast({
          description: "Attachment has been replaced!",
        });
      },
      onError: (e) => {
        toast({
          description: e.message,
          variant: "destructive",
        });
      },
    });

  const { mutate: detachAsset, isPending: isDetaching } =
    useDetachBookmarkAsset({
      onSuccess: () => {
        toast({
          description: "Attachment has been detached!",
        });
      },
      onError: (e) => {
        toast({
          description: e.message,
          variant: "destructive",
        });
      },
    });

  const { mutateAsync: deleteUnattachedAsset } = useDeleteUnattachedAsset();
  const { mutate: uploadAsset } = useUpload({
    onError: (e) => {
      toast({
        description: e.error,
        variant: "destructive",
      });
    },
    onSuccessError: async (resp) => {
      await deleteUnattachedAsset({ assetId: resp.assetId });
    },
  });

  bookmark.assets.sort((a, b) => a.assetType.localeCompare(b.assetType));

  const hasAssets = bookmark.assets.length > 0;

  return (
    <Collapsible defaultOpen={true}>
      <div className="w-full">
        <div className="flex w-full items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-foreground">
              {t("common.attachments")}
            </p>
            <p className="text-xs text-muted-foreground">
              {hasAssets
                ? `${bookmark.assets.length} attached item${bookmark.assets.length === 1 ? "" : "s"}`
                : readOnly
                  ? "No attachments available"
                  : "Add banners, screenshots, or uploaded files to this bookmark."}
            </p>
          </div>
          <div className="flex items-center gap-1 text-muted-foreground">
            {!readOnly && (
              <>
                {!bookmark.assets.some(
                  (asset) => asset.assetType == "bannerImage",
                ) &&
                  bookmark.content.type != BookmarkTypes.ASSET && (
                    <FilePickerButton
                      title="Attach a Banner"
                      loading={isAttaching}
                      accept={getFilePickerAccept("banner")}
                      multiple={false}
                      variant="none"
                      size="none"
                      className="rounded-md p-1 hover:text-foreground"
                      onFileSelect={(file) =>
                        uploadAsset(file, {
                          onSuccess: async (resp) => {
                            await attachAsset({
                              bookmarkId: bookmark.id,
                              asset: {
                                id: resp.assetId,
                                assetType: "bannerImage",
                              },
                            });
                          },
                        })
                      }
                    >
                      <ImagePlus className="size-3.5" strokeWidth={1.5} />
                    </FilePickerButton>
                  )}
                <FilePickerButton
                  title="Upload File"
                  loading={isAttaching}
                  multiple={false}
                  variant="none"
                  size="none"
                  className="rounded-md p-1 hover:text-foreground"
                  accept={getFilePickerAccept("attachment")}
                  onFileSelect={(file) =>
                    uploadAsset(file, {
                      onSuccess: async (resp) => {
                        await attachAsset({
                          bookmarkId: bookmark.id,
                          asset: {
                            id: resp.assetId,
                            assetType: "userUploaded",
                          },
                        });
                      },
                    })
                  }
                >
                  <Paperclip className="size-3.5" strokeWidth={1.5} />
                </FilePickerButton>
              </>
            )}
            {hasAssets && (
              <CollapsibleTrigger className="rounded-md p-1 hover:text-foreground">
                <ChevronsDownUp className="size-4" />
              </CollapsibleTrigger>
            )}
          </div>
        </div>
        <CollapsibleContent className="mt-3 flex flex-col gap-2 text-sm">
          {bookmark.assets.map((asset) => (
            <div
              key={asset.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-background px-3 py-2"
            >
              <Link
                target="_blank"
                href={getAssetUrl(asset.id)}
                className="ease-(--ease-out) flex min-w-0 items-center gap-2 text-xs text-muted-foreground transition-colors duration-150 hover:text-foreground"
                prefetch={false}
              >
                {ASSET_TYPE_TO_ICON[asset.assetType]}
                <p className="truncate">
                  {asset.assetType === "userUploaded" && asset.fileName
                    ? asset.fileName
                    : humanFriendlyNameForAssertType(asset.assetType)}
                </p>
              </Link>
              <div className="flex shrink-0 gap-1 text-muted-foreground">
                <Link
                  title="Download"
                  target="_blank"
                  href={getAssetUrl(asset.id)}
                  className="flex items-center gap-1 rounded-md p-1 hover:text-foreground"
                  download={
                    asset.assetType === "userUploaded" && asset.fileName
                      ? asset.fileName
                      : humanFriendlyNameForAssertType(asset.assetType)
                  }
                  prefetch={false}
                >
                  <Download className="size-3.5" strokeWidth={1.5} />
                </Link>
                {!readOnly &&
                  isAllowedToAttachAsset(asset.assetType) &&
                  asset.assetType !== "userUploaded" && (
                    <FilePickerButton
                      title="Replace"
                      loading={isReplacing}
                      accept={getFilePickerAccept("attachment")}
                      multiple={false}
                      variant="none"
                      size="none"
                      className="flex items-center gap-2 rounded-md p-1 hover:text-foreground"
                      onFileSelect={(file) =>
                        uploadAsset(file, {
                          onSuccess: async (resp) => {
                            await replaceAsset({
                              bookmarkId: bookmark.id,
                              oldAssetId: asset.id,
                              newAssetId: resp.assetId,
                            });
                          },
                        })
                      }
                    >
                      <Pencil className="size-3.5" strokeWidth={1.5} />
                    </FilePickerButton>
                  )}
                {!readOnly && isAllowedToDetachAsset(asset.assetType) && (
                  <ActionConfirmingDialog
                    title="Delete Attachment?"
                    description={`Are you sure you want to delete the attachment of the bookmark?`}
                    actionButton={(setDialogOpen) => (
                      <ActionButton
                        loading={isDetaching}
                        variant="destructive"
                        onClick={() =>
                          detachAsset(
                            { bookmarkId: bookmark.id, assetId: asset.id },
                            { onSettled: () => setDialogOpen(false) },
                          )
                        }
                      >
                        <Trash2 className="mr-2 size-4" />
                        Delete
                      </ActionButton>
                    )}
                  >
                    <Button
                      variant="none"
                      size="none"
                      title="Delete"
                      className="rounded-md p-1 hover:text-foreground"
                    >
                      <Trash2 className="size-3.5" strokeWidth={1.5} />
                    </Button>
                  </ActionConfirmingDialog>
                )}
              </div>
            </div>
          ))}
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
