import { useTranslation } from "@/lib/i18n/server";
import { TFunction } from "i18next";

import MobileAddButton from "./MobileAddButton";
import MobileNavSelection from "./MobileNavSelection";
import MobileSidebarItem from "./ModileSidebarItem";
import MobileTabNavigation from "./MobileTabNavigation";
import { TSidebarItem } from "./TSidebarItem";

export default async function MobileSidebar({
  items,
  itemClassName,
  dashboardTabs = false,
}: {
  items: (t: TFunction) => TSidebarItem[];
  itemClassName?: string;
  dashboardTabs?: boolean;
}) {
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();
  // Lift the floating bar clear of the phone's home-indicator / gesture
  // handle: the device safe-area inset when it resolves (iOS standalone), plus
  // a comfortable static gap so there's breathing room even in plain browser
  // tabs where `env()` reports 0.
  const navigation = (
    <MobileNavSelection>
      <nav
        className="fixed inset-x-3 bottom-0 z-40 sm:hidden"
        aria-label={
          dashboardTabs
            ? t("common.navigation", { defaultValue: "Library navigation" })
            : t("common.navigation", { defaultValue: "Section navigation" })
        }
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1.5rem)" }}
      >
        {/* Horizontally scrollable so dense navs (e.g. settings, 13 items) don't
          overflow the viewport; the few-item dashboard nav still spreads to
          fill since each item can grow past its basis. Scrollbar is hidden for
          the clean floating-bar look. */}
        <ul className="mx-auto flex max-w-md items-center gap-0.5 overflow-x-auto overscroll-x-contain rounded-[18px] border border-border bg-background/95 p-1 shadow-sm backdrop-blur-xl [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {items(t).map((item) => (
            <MobileSidebarItem
              key={item.name}
              name={item.name}
              logo={item.icon}
              path={item.path}
              className={itemClassName}
              prefetch={dashboardTabs ? true : undefined}
            />
          ))}
          <MobileAddButton />
        </ul>
      </nav>
    </MobileNavSelection>
  );
  return dashboardTabs ? (
    <MobileTabNavigation>{navigation}</MobileTabNavigation>
  ) : (
    navigation
  );
}
