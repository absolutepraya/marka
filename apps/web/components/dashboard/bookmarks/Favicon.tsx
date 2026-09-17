"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { Globe } from "lucide-react";

/**
 * Site favicon with a render-time fallback chain. Remote hostname services
 * are opt-in so authenticated surfaces can avoid disclosing private URLs.
 */
export default function Favicon({
  url,
  storedFavicon,
  className,
  allowRemoteFallback = false,
}: {
  url: string;
  storedFavicon?: string | null;
  className?: string;
  allowRemoteFallback?: boolean;
}) {
  const candidates = useMemo(() => {
    const list: string[] = [];
    if (storedFavicon) {
      list.push(storedFavicon);
    }
    let hostname: string | null = null;
    try {
      hostname = new URL(url).hostname;
    } catch {
      hostname = null;
    }
    if (allowRemoteFallback && hostname) {
      list.push(`https://icons.duckduckgo.com/ip3/${hostname}.ico`);
      list.push(`https://www.google.com/s2/favicons?domain=${hostname}&sz=64`);
    }
    return list;
  }, [allowRemoteFallback, storedFavicon, url]);

  // Track failed sources so the chain survives candidate changes (e.g. a
  // stored favicon appearing after a crawl) and always shows the best option.
  const [failed, setFailed] = useState<Set<string>>(() => new Set());
  const src = candidates.find((candidate) => !failed.has(candidate));

  if (!src) {
    return (
      <Globe className={cn("shrink-0 text-muted-foreground", className)} />
    );
  }

  return (
    <Image
      key={src}
      src={src}
      alt=""
      width={16}
      height={16}
      unoptimized
      loading="lazy"
      referrerPolicy="no-referrer"
      className={cn("shrink-0 rounded-sm object-contain", className)}
      onError={() => setFailed((prev) => new Set(prev).add(src))}
    />
  );
}
