"use client";

import React from "react";
import Link from "next/link";
import { usePwaLifecycle } from "@/components/pwa/ServiceWorkerRegistration";
import { useClientConfig } from "@/lib/clientConfig";
import { useTranslation } from "@/lib/i18n/client";
import { Download, GitBranch, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

const FORK_REPO = "absolutepraya/marka";
const FORK_REPO_URL = `https://github.com/${FORK_REPO}`;

function isCommitSha(value?: string): value is string {
  return !!value && /^[0-9a-f]{7,40}$/i.test(value);
}

function displayBuild(value: string) {
  return isCommitSha(value) ? value.slice(0, 7) : value;
}

interface SidebarVersionProps {
  placement?: "sidebar" | "profile";
}

export default function SidebarVersion({
  placement = "sidebar",
}: SidebarVersionProps) {
  const { t } = useTranslation("profile_menu");
  const { serverRelease, serverCommitShort } = useClientConfig();
  const {
    appBuild,
    deployedBuild,
    updateStatus,
    updateAvailable,
    checkForUpdate,
    activateUpdate,
  } = usePwaLifecycle();
  const validAppBuild = isCommitSha(appBuild);
  const visibleBuild = validAppBuild
    ? displayBuild(appBuild)
    : appBuild === "development"
      ? "development"
      : "unknown";
  const visibleVersion = serverRelease
    ? `v${serverRelease} · ${serverCommitShort ?? visibleBuild}`
    : (serverCommitShort ?? visibleBuild);
  const containerClassName =
    placement === "profile"
      ? "flex h-7 min-w-0 items-center justify-between gap-2 text-[11px] leading-4"
      : "flex min-w-0 items-center justify-between gap-3 text-xs leading-tight";
  const buildClassName =
    placement === "profile"
      ? "flex min-w-0 flex-1 items-center gap-1.5 font-mono text-[11px] leading-4 text-muted-foreground opacity-50 transition-[color,opacity] duration-150 hover:text-foreground hover:opacity-100"
      : "flex min-w-0 items-center gap-1.5 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground";
  const buildColorClassName =
    placement === "profile"
      ? "text-muted-foreground opacity-50"
      : "text-muted-foreground";
  const buildIconClassName = placement === "profile" ? "size-3" : "size-3.5";
  const buildTextClassName =
    placement === "profile"
      ? "min-w-0 truncate rounded-sm bg-muted/50 px-1.5 py-0.5"
      : "truncate";
  const updateSlotClassName =
    placement === "profile"
      ? "flex h-7 w-32 shrink-0 items-center justify-end gap-1 overflow-hidden font-mono text-[11px] leading-4 text-muted-foreground"
      : "flex min-w-0 shrink-0 items-center justify-end gap-1 font-mono text-xs text-muted-foreground";
  const updateButtonClassName =
    placement === "profile"
      ? "h-7 w-full min-w-0 gap-1.5 rounded-md px-2 py-1 font-mono text-[11px] leading-4 text-muted-foreground hover:bg-accent/70 hover:text-foreground"
      : "h-auto gap-1 px-1.5 py-1 font-mono text-xs text-muted-foreground";
  const updateStatusClassName =
    placement === "profile" ? "min-w-0 truncate" : undefined;

  const buildLabel = t("build", { build: visibleVersion });

  return (
    <div className={containerClassName}>
      {validAppBuild ? (
        <Link
          href={`${FORK_REPO_URL}/commit/${appBuild}`}
          target="_blank"
          rel="noopener noreferrer"
          title={t("build_title", { build: appBuild })}
          className={buildClassName}
        >
          <span className={buildTextClassName}>{buildLabel}</span>
          <GitBranch className={`${buildIconClassName} shrink-0`} />
        </Link>
      ) : (
        <span className={buildClassName}>
          <span className={buildTextClassName}>{buildLabel}</span>
          <GitBranch className={`${buildIconClassName} shrink-0`} />
        </span>
      )}
      <div className={updateSlotClassName}>
        {!validAppBuild || !deployedBuild || updateStatus === "unavailable" ? (
          <span className={updateStatusClassName ?? buildColorClassName}>
            {t("update_unavailable")}
          </span>
        ) : updateStatus === "checking" ? (
          <span className={updateStatusClassName} title={t("checking")}>
            {t("checking")}
          </span>
        ) : updateStatus === "installing" ? (
          <span className={updateStatusClassName} title={t("preparing_update")}>
            {t("preparing_update")}
          </span>
        ) : updateStatus === "error" ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={checkForUpdate}
            title={t("check_failed")}
            className={updateButtonClassName}
          >
            <RefreshCw aria-hidden="true" className="size-3 shrink-0" />
            <span className="min-w-0 truncate">{t("check_failed")}</span>
          </Button>
        ) : updateStatus === "blocked" ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={activateUpdate}
            title={t("close_other_tabs")}
            className={updateButtonClassName}
          >
            <RefreshCw aria-hidden="true" className="size-3 shrink-0" />
            <span className="min-w-0 truncate">{t("close_other_tabs")}</span>
          </Button>
        ) : updateStatus === "updating" ? (
          <span className={updateStatusClassName} title={t("updating")}>
            {t("updating")}
          </span>
        ) : updateAvailable && updateStatus === "ready" ? (
          <Button
            type="button"
            size="sm"
            onClick={activateUpdate}
            title={t("update_now")}
            className={`${updateButtonClassName} bg-emerald-500/15 text-emerald-700 ring-1 ring-inset ring-emerald-500/20 hover:bg-emerald-500/25 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300`}
          >
            <Download aria-hidden="true" className="size-3 shrink-0" />
            <span className="min-w-0 truncate">{t("update_now")}</span>
          </Button>
        ) : updateAvailable ? (
          <span className={updateStatusClassName} title={t("preparing_update")}>
            {t("preparing_update")}
          </span>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={checkForUpdate}
            title={t("up_to_date")}
            className={updateButtonClassName}
          >
            <RefreshCw aria-hidden="true" className="size-3 shrink-0" />
            <span className="min-w-0 truncate">{t("up_to_date")}</span>
          </Button>
        )}
      </div>
    </div>
  );
}
