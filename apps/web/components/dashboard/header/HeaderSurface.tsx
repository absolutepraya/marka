"use client";

import type { ReactNode } from "react";
import React, { useEffect, useState } from "react";

export default function HeaderSurface({ children }: { children: ReactNode }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const syncScroll = () => setScrolled(window.scrollY > 8);
    syncScroll();
    window.addEventListener("scroll", syncScroll, { passive: true });
    window.addEventListener("pageshow", syncScroll);
    return () => {
      window.removeEventListener("scroll", syncScroll);
      window.removeEventListener("pageshow", syncScroll);
    };
  }, []);

  return (
    <header
      data-scrolled={scrolled}
      className="mobile-header-frost sm:bg-sidebar/95 sticky left-0 right-0 top-0 isolate z-50"
    >
      {children}
    </header>
  );
}
