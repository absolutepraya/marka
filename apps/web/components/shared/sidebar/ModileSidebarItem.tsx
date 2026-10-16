"use client";

import React, { useEffect, useRef } from "react";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import LineLoader from "@/components/ui/line-loader";
import { haptic } from "@/lib/haptic";
import { cn } from "@/lib/utils";

import { useSaveTabPosition } from "./MobileTabNavigation";
import { useMobileNavSelection } from "./MobileNavSelection";

function TabContent({
  logo,
  isActive,
  path,
}: {
  logo: React.ReactNode;
  isActive: boolean;
  path: string;
}) {
  const { pending } = useLinkStatus();
  const selection = useMobileNavSelection();
  const wasPending = useRef(false);
  useEffect(() => {
    if (pending) wasPending.current = true;
    else if (wasPending.current) {
      wasPending.current = false;
      selection?.finish(path);
    }
  }, [pending, path, selection]);
  return (
    <span
      aria-busy={pending}
      className="relative flex items-center justify-center"
    >
      <span className="flex size-6 items-center justify-center [&_svg]:size-[22px] [&_svg]:stroke-2">
        {logo}
      </span>
      {isActive && (
        <LineLoader
          pending={pending}
          className="-bottom-2.5 bg-foreground/60"
        />
      )}
    </span>
  );
}

export default function MobileSidebarItem({
  name,
  logo,
  path,
  className,
  prefetch,
}: {
  name: string;
  logo: React.ReactNode;
  path: string;
  className?: string;
  prefetch?: boolean;
}) {
  const currentPath = usePathname();
  const selection = useMobileNavSelection();
  const selectedPath = selection?.selectedPath ?? currentPath;
  const isActive = selectedPath === path || selectedPath.startsWith(`${path}/`);
  const ref = useRef<HTMLLIElement>(null);
  const savePosition = useSaveTabPosition();

  // When the nav scrolls horizontally (dense settings nav), keep the active
  // tab in view so the user can always see where they are.
  useEffect(() => {
    if (isActive) {
      ref.current?.scrollIntoView({ inline: "center", block: "nearest" });
    }
  }, [isActive]);

  return (
    // basis lets items keep a comfortable min width and scroll when there are
    // many; grow makes the few-item dashboard nav spread to fill the bar.
    <li
      ref={ref}
      className={cn("flex min-w-[44px] shrink-0 grow basis-11", className)}
    >
      <Link
        onClick={haptic}
        onNavigate={() => {
          savePosition?.();
          selection?.select(path);
        }}
        prefetch={prefetch}
        scroll={savePosition ? false : undefined}
        href={path}
        title={name}
        aria-label={name}
        aria-current={isActive ? "page" : undefined}
        className={cn(
          "ease-(--ease-out) relative flex min-h-[52px] w-full items-center justify-center rounded-[14px] px-1.5 py-2 transition-transform duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring active:scale-[0.96] motion-reduce:transition-none",
          isActive
            ? "bg-primary/15 text-foreground shadow-inner shadow-primary/25 ring-1 ring-inset ring-primary/40"
            : "text-foreground/80",
        )}
      >
        <TabContent logo={logo} isActive={isActive} path={path} />
      </Link>
    </li>
  );
}
