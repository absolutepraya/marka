"use client";
import { CapturedSkeleton } from "@/components/loading-ui/CapturedSkeleton";
import bones from "@/components/loading-ui/bones/backups.bones.json";

import Link from "next/link";
import { EmptyState } from "@/components/shared/EmptyState";
import { ActionButton } from "@/components/ui/action-button";
import FormattedDate from "@/components/ui/formatted-date";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { useTranslation } from "@/lib/i18n/client";
import { useUserSettings } from "@/lib/userSettings";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle,
  CloudDownload,
  Download,
  Play,
  Save,
  Trash2,
  XCircle,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { useUpdateUserSettings } from "@karakeep/shared-react/hooks/users";
import { useTRPC } from "@karakeep/shared-react/trpc";
import { zBackupSchema } from "@karakeep/shared/types/backups";
import { zUpdateBackupSettingsSchema } from "@karakeep/shared/types/users";
import { getAssetUrl } from "@karakeep/shared/utils/assetUtils";

import ActionConfirmingDialog from "../ui/action-confirming-dialog";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import { Switch } from "../ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { SettingsSection } from "./SettingsPage";

function BackupConfigurationForm() {
  const { t } = useTranslation();

  const settings = useUserSettings();
  const { mutate: updateSettings, isPending: isUpdating } =
    useUpdateUserSettings({
      onSuccess: () => {
        toast({
          description: t("settings.info.user_settings.user_settings_updated"),
        });
      },
      onError: () => {
        toast({
          description: t("common.something_went_wrong"),
          variant: "destructive",
        });
      },
    });

  const form = useForm<z.infer<typeof zUpdateBackupSettingsSchema>>({
    resolver: zodResolver(zUpdateBackupSettingsSchema),
    values: settings
      ? {
          backupsEnabled: settings.backupsEnabled,
          backupsFrequency: settings.backupsFrequency,
          backupsRetentionDays: settings.backupsRetentionDays,
        }
      : undefined,
  });

  return (
    <SettingsSection
      title={t("settings.backups.configuration.title")}
      description="Choose how often backups should run and how long completed archives stay available."
    >
      <Form {...form}>
        <form
          className="space-y-4"
          onSubmit={form.handleSubmit((value) => {
            updateSettings(value);
          })}
        >
          <FormField
            control={form.control}
            name="backupsEnabled"
            render={({ field }) => (
              <FormItem className="shadow-xs flex flex-row items-center justify-between gap-4 rounded-xl border border-border/70 bg-background/80 p-4">
                <div className="space-y-1">
                  <FormLabel>
                    {t(
                      "settings.backups.configuration.enable_automatic_backups",
                    )}
                  </FormLabel>
                  <FormDescription>
                    {t(
                      "settings.backups.configuration.enable_automatic_backups_description",
                    )}
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
              </FormItem>
            )}
          />

          <div className="grid gap-4 md:grid-cols-2">
            <FormField
              control={form.control}
              name="backupsFrequency"
              render={({ field }) => (
                <FormItem className="shadow-xs rounded-xl border border-border/70 bg-background/80 p-4">
                  <FormLabel>
                    {t("settings.backups.configuration.backup_frequency")}
                  </FormLabel>
                  <FormControl>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      {...field}
                    >
                      <SelectTrigger className="mt-2">
                        <SelectValue
                          placeholder={t(
                            "settings.backups.configuration.select_frequency",
                          )}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="daily">
                          {t("settings.backups.configuration.frequency.daily")}
                        </SelectItem>
                        <SelectItem value="weekly">
                          {t("settings.backups.configuration.frequency.weekly")}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormDescription className="mt-2">
                    {t(
                      "settings.backups.configuration.backup_frequency_description",
                    )}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="backupsRetentionDays"
              render={({ field }) => (
                <FormItem className="shadow-xs rounded-xl border border-border/70 bg-background/80 p-4">
                  <FormLabel>
                    {t("settings.backups.configuration.retention_period")}
                  </FormLabel>
                  <FormControl>
                    <Input
                      className="mt-2"
                      type="number"
                      min={1}
                      max={365}
                      {...field}
                      onChange={(e) => field.onChange(parseInt(e.target.value))}
                    />
                  </FormControl>
                  <FormDescription className="mt-2">
                    {t(
                      "settings.backups.configuration.retention_period_description",
                    )}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <ActionButton
            type="submit"
            loading={isUpdating}
            className="items-center"
          >
            <Save className="mr-2 size-4" />
            {t("settings.backups.configuration.save_settings")}
          </ActionButton>
        </form>
      </Form>
    </SettingsSection>
  );
}

function BackupRow({ backup }: { backup: z.infer<typeof zBackupSchema> }) {
  const api = useTRPC();
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const { mutate: deleteBackup, isPending: isDeleting } = useMutation(
    api.backups.delete.mutationOptions({
      onSuccess: () => {
        toast({
          description: t("settings.backups.toasts.backup_deleted"),
        });
        queryClient.invalidateQueries(api.backups.list.pathFilter());
      },
      onError: (error) => {
        toast({
          description: `Error: ${error.message}`,
          variant: "destructive",
        });
      },
    }),
  );

  return (
    <BackupRowContent
      backup={backup}
      actions={
        <>
          <div className="flex items-center gap-2">
            {backup.assetId && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    asChild
                    variant="ghost"
                    size="icon"
                    className="rounded-full"
                    disabled={backup.status !== "success"}
                  >
                    <Link
                      href={getAssetUrl(backup.assetId)}
                      download
                      prefetch={false}
                      className={
                        backup.status !== "success"
                          ? "pointer-events-none opacity-50"
                          : ""
                      }
                    >
                      <Download className="size-4" />
                    </Link>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {t("settings.backups.list.actions.download_backup")}
                </TooltipContent>
              </Tooltip>
            )}
            <ActionConfirmingDialog
              title={t("settings.backups.dialogs.delete_backup_title")}
              description={t(
                "settings.backups.dialogs.delete_backup_description",
              )}
              actionButton={() => (
                <ActionButton
                  loading={isDeleting}
                  variant="destructive"
                  onClick={() => deleteBackup({ backupId: backup.id })}
                  className="items-center"
                  type="button"
                >
                  <Trash2 className="mr-2 size-4" />
                  {t("settings.backups.list.actions.delete_backup")}
                </ActionButton>
              )}
            >
              <Button
                variant="ghostDestructive"
                size="icon"
                disabled={isDeleting}
              >
                <Trash2 className="size-4" />
              </Button>
            </ActionConfirmingDialog>
          </div>
        </>
      }
    />
  );
}

export function BackupRowContent({
  backup,
  actions,
}: {
  backup: z.infer<typeof zBackupSchema>;
  actions: React.ReactNode;
}) {
  const { t } = useTranslation();
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };
  return (
    <TableRow>
      <TableCell>
        <FormattedDate date={backup.createdAt} />
      </TableCell>
      <TableCell>
        {backup.status === "pending"
          ? "-"
          : backup.bookmarkCount.toLocaleString()}
      </TableCell>
      <TableCell>
        {backup.status === "pending" ? "-" : formatSize(backup.size)}
      </TableCell>
      <TableCell>
        {backup.status === "success" ? (
          <Badge
            variant="secondary"
            className="border-success/20 bg-success/10 text-success gap-1.5 border"
          >
            <CheckCircle className="size-3.5" />
            {t("settings.backups.list.status.success")}
          </Badge>
        ) : backup.status === "failure" ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <Badge
                  variant="secondary"
                  className="gap-1.5 border border-destructive/20 bg-destructive/10 text-destructive"
                >
                  <XCircle className="size-3.5" />
                  {t("settings.backups.list.status.failed")}
                </Badge>
              </div>
            </TooltipTrigger>
            <TooltipContent>{backup.errorMessage}</TooltipContent>
          </Tooltip>
        ) : (
          <Badge
            variant="secondary"
            className="gap-1.5 border border-border/70 bg-muted/70 text-muted-foreground"
          >
            {t("settings.backups.list.status.pending")}
          </Badge>
        )}
      </TableCell>
      <TableCell>{actions}</TableCell>
    </TableRow>
  );
}

function BackupsList() {
  const api = useTRPC();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: backups, isLoading } = useQuery(
    api.backups.list.queryOptions(undefined, {
      refetchInterval: (query) => {
        const data = query.state.data;
        return data?.backups.some((backup) => backup.status === "pending")
          ? 3000
          : false;
      },
    }),
  );

  const { mutate: triggerBackup, isPending: isTriggering } = useMutation(
    api.backups.triggerBackup.mutationOptions({
      onSuccess: () => {
        toast({
          description: t("settings.backups.toasts.backup_queued"),
        });
        queryClient.invalidateQueries(api.backups.list.pathFilter());
      },
      onError: (error) => {
        toast({
          description: `Error: ${error.message}`,
          variant: "destructive",
        });
      },
    }),
  );

  return (
    <SettingsSection
      title={t("settings.backups.list.title")}
      description="Create a fresh backup now, then review completed archives and remove anything you no longer need."
      action={
        <ActionButton
          onClick={() => triggerBackup()}
          loading={isTriggering}
          variant="default"
          className="items-center"
        >
          <Play className="mr-2 size-4" />
          {t("settings.backups.list.create_backup_now")}
        </ActionButton>
      }
    >
      {isLoading && (
        <div>
          <CapturedSkeleton name="backups" bones={bones} />
        </div>
      )}

      {backups && backups.backups.length === 0 && (
        <EmptyState
          compact
          icon={<CloudDownload className="size-6" />}
          title={t("settings.backups.list.no_backups")}
          description="Your first successful backup will appear here once it has been generated."
          className="bg-background/70"
        />
      )}

      {backups && backups.backups.length > 0 && (
        <div className="shadow-xs overflow-hidden rounded-xl border border-border/70 bg-background/80">
          <BackupsTable>
            {backups.backups.map((backup) => (
              <BackupRow key={backup.id} backup={backup} />
            ))}
          </BackupsTable>
        </div>
      )}
    </SettingsSection>
  );
}

export default function BackupSettings() {
  return (
    <>
      <BackupConfigurationForm />
      <BackupsList />
    </>
  );
}

export function BackupsTable({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  return (
    <Table className="whitespace-nowrap">
      <TableHeader>
        <TableRow>
          <TableHead>{t("settings.backups.list.table.created_at")}</TableHead>
          <TableHead>{t("settings.backups.list.table.bookmarks")}</TableHead>
          <TableHead>{t("settings.backups.list.table.size")}</TableHead>
          <TableHead>{t("settings.backups.list.table.status")}</TableHead>
          <TableHead>{t("settings.backups.list.table.actions")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>{children}</TableBody>
    </Table>
  );
}
