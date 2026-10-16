"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export default function SidebarItem({
  name,
  description,
  logo,
  path,
  className,
  linkClassName,
  style,
  collapseButton,
  right = null,
  dropHighlight = false,
  onDrop,
  onDragOver,
  onDragEnter,
  onDragLeave,
  onNavigate,
  as: Component = "li",
}: {
  name: string;
  description?: string;
  logo: React.ReactNode;
  path: string;
  style?: React.CSSProperties;
  className?: string;
  linkClassName?: string;
  right?: React.ReactNode;
  collapseButton?: React.ReactNode;
  dropHighlight?: boolean;
  onDrop?: React.DragEventHandler;
  onDragOver?: React.DragEventHandler;
  onDragEnter?: React.DragEventHandler;
  onDragLeave?: React.DragEventHandler;
  onNavigate?: () => void;
  as?: "li" | "div";
}) {
  const currentPath = usePathname();
  const isActive = path == currentPath;

  return (
    <Component
      className={cn(
        "ease-(--ease-out) group relative flex min-w-0 items-center justify-between overflow-hidden rounded-xl text-sm transition-[background-color,color,box-shadow,ring-color] duration-150",
        isActive
          ? "bg-primary/[0.07] text-foreground shadow-inner shadow-primary/10 ring-1 ring-inset ring-primary/30"
          : "text-muted-foreground hover:bg-primary/[0.05] hover:text-foreground hover:shadow-inner hover:shadow-primary/10",
        dropHighlight &&
          "bg-primary/12 text-foreground shadow-inner shadow-primary/30 ring-1 ring-inset ring-primary/70",
        className,
      )}
      style={style}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
    >
      <div className="flex min-w-0 flex-1 items-center rounded-l-[inherit]">
        {collapseButton}
        <Link
          href={path}
          aria-current={isActive ? "page" : undefined}
          onNavigate={onNavigate}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-x-2 rounded-[inherit] px-3 py-2.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-foreground",
            linkClassName,
          )}
        >
          <span
            className={cn(
              "ease-(--ease-out) flex size-5 shrink-0 items-center justify-center text-muted-foreground transition-colors duration-150",
              isActive ? "text-foreground" : "group-hover:text-foreground",
            )}
          >
            {logo}
          </span>
          <span className="flex min-w-0 flex-col">
            <span title={name} className="truncate font-medium">
              {name}
            </span>
            {description && (
              <span
                title={description}
                className="truncate text-xs text-muted-foreground"
              >
                {description}
              </span>
            )}
          </span>
        </Link>
      </div>
      {right}
    </Component>
  );
}
