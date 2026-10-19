"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import { redirect, useRouter } from "next/navigation";
import SidebarVersion from "@/components/shared/sidebar/SidebarVersion";
import { usePwaLifecycle } from "@/components/pwa/ServiceWorkerRegistration";
import { useToggleTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { UserAvatar } from "@/components/ui/user-avatar";
import { useSession } from "@/lib/auth/client";
import { useTranslation } from "@/lib/i18n/client";
import {
  BookOpen,
  LogOut,
  Moon,
  Paintbrush,
  Puzzle,
  Settings,
  Shield,
  Sun,
} from "lucide-react";
import { useTheme } from "@teispace/next-themes";

import { useWhoAmI } from "@karakeep/shared-react/hooks/users";

import { AdminNoticeBadge } from "../../admin/AdminNotices";

function DarkModeToggle() {
  const { t } = useTranslation();
  const { theme } = useTheme();

  if (theme == "dark") {
    return (
      <>
        <Sun className="mr-2 size-4" />
        <span>{t("options.light_mode")}</span>
      </>
    );
  } else {
    return (
      <>
        <Moon className="mr-2 size-4" />
        <span>{t("options.dark_mode")}</span>
      </>
    );
  }
}

function ComingSoonFeature({
  icon,
  label,
  comingSoon,
}: {
  icon: React.ReactNode;
  label: string;
  comingSoon: string;
}) {
  return (
    <DropdownMenuItem disabled className="items-start">
      <span className="mr-2 mt-0.5 shrink-0">{icon}</span>
      <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
        <span className="truncate">{label}</span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {comingSoon}
        </span>
      </div>
    </DropdownMenuItem>
  );
}

export default function SidebarProfileOptions() {
  const { t } = useTranslation();
  const { t: tProfile } = useTranslation("profile_menu");
  const toggleTheme = useToggleTheme();
  const { data: session } = useSession();
  const { data: whoami } = useWhoAmI();
  const router = useRouter();
  const { updateAvailable } = usePwaLifecycle();

  const avatarImage = whoami?.image ?? null;
  const avatarUrl = useMemo(() => avatarImage ?? null, [avatarImage]);

  if (!session) return redirect("/");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={tProfile("profile", { defaultValue: "Profile menu" })}
          className="shadow-xs ease-(--ease-out) flex size-10 shrink-0 rounded-full border border-border/70 bg-background p-0 text-foreground transition-[background-color,border-color,box-shadow] duration-150 hover:bg-accent/70"
          variant="ghost"
        >
          <span className="relative size-full">
            <UserAvatar
              image={avatarUrl}
              name={session.user.name}
              className="size-full rounded-full border border-border/70"
            />
            {updateAvailable && (
              <span
                role="status"
                aria-label={tProfile("update_available_status")}
                className="absolute bottom-0 right-0 size-2.5 rounded-full border-2 border-background bg-emerald-500"
              />
            )}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="mr-2 w-72 rounded-xl p-2">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          <div className="shadow-xs flex aspect-square size-11 items-center justify-center overflow-hidden rounded-full border border-border/70 bg-card">
            <UserAvatar
              image={avatarUrl}
              name={session.user.name}
              className="h-full w-full"
            />
          </div>
          <div className="flex min-w-0 flex-col">
            <p className="truncate font-medium text-foreground">
              {session.user.name}
            </p>
            <p className="truncate text-sm text-muted-foreground">
              {session.user.email}
            </p>
          </div>
        </div>
        <Separator className="my-2" />
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <Settings className="mr-2 size-4" />
            {t("settings.user_settings")}
          </Link>
        </DropdownMenuItem>
        {session.user.role == "admin" && (
          <DropdownMenuItem asChild>
            <Link href="/admin" className="flex justify-between">
              <div className="items-cente flex gap-2">
                <Shield className="size-4" />
                {t("admin.admin_settings")}
              </div>
              <AdminNoticeBadge />
            </Link>
          </DropdownMenuItem>
        )}
        <Separator className="my-2" />
        <DropdownMenuItem asChild>
          <Link href="/dashboard/cleanups">
            <Paintbrush className="mr-2 size-4" />
            {t("cleanups.cleanups")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={toggleTheme}>
          <DarkModeToggle />
        </DropdownMenuItem>
        <Separator className="my-2" />
        <ComingSoonFeature
          icon={<Puzzle className="size-4" />}
          label={tProfile("apps_extensions")}
          comingSoon={tProfile("coming_soon")}
        />
        <ComingSoonFeature
          icon={<BookOpen className="size-4" />}
          label={tProfile("documentation")}
          comingSoon={tProfile("coming_soon")}
        />
        <Separator className="my-2" />
        <DropdownMenuItem onClick={() => router.push("/logout")}>
          <LogOut className="mr-2 size-4" />
          <span>{t("actions.sign_out")}</span>
        </DropdownMenuItem>
        <SidebarVersion placement="profile" />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
