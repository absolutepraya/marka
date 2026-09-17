"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useTranslation } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { AudioLines, Download } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const PLAYBACK_RATES = [0.5, 1, 1.25, 1.5, 2] as const;

export function AudioPlayer({
  src,
  fileName,
  contentType,
  title,
  compact = false,
}: {
  src: string;
  fileName?: string | null;
  contentType?: string | null;
  title?: string | null;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const audioRef = useRef<HTMLAudioElement>(null);
  const rateId = useId();
  const [playbackRate, setPlaybackRate] = useState("1");
  const [playbackErrorSource, setPlaybackErrorSource] = useState<string | null>(
    null,
  );
  const resolvedFileName = fileName || t("common.audio");
  const accessibleName = title || resolvedFileName;
  const sourceKey = `${src}:${contentType ?? ""}`;
  const playbackError = playbackErrorSource === sourceKey;

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = Number(playbackRate);
    }
  }, [sourceKey, playbackRate]);

  const handlePlaybackRateChange = (value: string) => {
    setPlaybackRate(value);
    if (audioRef.current) {
      audioRef.current.playbackRate = Number(value);
    }
  };

  if (playbackError) {
    return (
      <div
        role="alert"
        className={cn(
          "flex flex-col items-center justify-center gap-3 text-center text-sm text-muted-foreground",
          compact ? "p-3" : "max-w-md p-6",
        )}
      >
        <AudioLines className="size-8" aria-hidden="true" />
        <p>{t("common.audio_playback_unavailable")}</p>
        <Link
          href={src}
          download={resolvedFileName}
          className="inline-flex items-center gap-2 font-medium text-foreground underline underline-offset-4"
        >
          <Download className="size-4" aria-hidden="true" />
          {t("actions.download_file", { fileName: resolvedFileName })}
        </Link>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex w-full flex-col gap-3",
        compact ? "p-3 lg:max-w-2xl lg:p-6" : "max-w-2xl p-6",
      )}
    >
      {/* eslint-disable-next-line jsx-a11y/media-has-caption -- captions are not part of the uploaded-audio model */}
      <audio
        key={`${src}:${contentType ?? ""}`}
        ref={audioRef}
        className="w-full"
        controls
        preload="metadata"
        aria-label={accessibleName}
        onError={() => setPlaybackErrorSource(sourceKey)}
      >
        <source src={src} type={contentType ?? undefined} />
        {t("common.audio_browser_unsupported")}
      </audio>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
          <AudioLines className="size-4 shrink-0" aria-hidden="true" />
          <span className="truncate">{resolvedFileName}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <label htmlFor={rateId} className="sr-only">
            {t("common.audio_playback_speed")}
          </label>
          <Select value={playbackRate} onValueChange={handlePlaybackRateChange}>
            <SelectTrigger
              id={rateId}
              className="w-[5.5rem]"
              aria-label={t("common.audio_playback_speed")}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PLAYBACK_RATES.map((rate) => (
                <SelectItem key={rate} value={String(rate)}>
                  {rate}x
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Link
            href={src}
            download={resolvedFileName}
            aria-label={t("actions.download_file", {
              fileName: resolvedFileName,
            })}
            className="inline-flex size-9 items-center justify-center rounded-md border border-border text-foreground transition-colors hover:bg-accent"
          >
            <Download className="size-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </div>
  );
}
