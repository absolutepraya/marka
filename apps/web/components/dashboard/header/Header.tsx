import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import ProfileOptions from "@/components/dashboard/header/ProfileOptions";
import ProcessingStatusIndicator from "@/components/dashboard/header/ProcessingStatusIndicator";
import { SearchInput } from "@/components/dashboard/search/SearchInput";
import MarkaLogo from "@/components/MarkaLogo";
import { getServerAuthSession } from "@/server/auth";

import HeaderSurface from "./HeaderSurface";

export default async function Header() {
  const session = await getServerAuthSession();
  if (!session) {
    redirect("/");
  }

  return (
    <HeaderSurface>
      <div className="flex h-16 items-center gap-3 overflow-x-auto overflow-y-hidden px-3 sm:px-4 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)]">
        <div className="hidden shrink-0 items-center sm:flex">
          <Link
            href={"/dashboard/bookmarks"}
            className="flex w-56 items-center justify-start pl-2"
          >
            <MarkaLogo height={30} />
          </Link>
        </div>
        <div className="min-w-0 flex-1 lg:col-start-2 lg:row-start-1">
          <SearchInput className="w-full" />
        </div>
        <div className="relative ml-3 flex h-10 shrink-0 items-center pr-5 sm:ml-4 lg:col-start-3 lg:row-start-1 lg:justify-self-end">
          <ProcessingStatusIndicator />
          <div className="absolute right-0 top-1/2 z-10 size-10 -translate-y-1/2">
            <ProfileOptions />
          </div>
        </div>
      </div>
      <span
        aria-hidden="true"
        className="mobile-header-frost-layer sm:hidden"
      />
    </HeaderSurface>
  );
}
