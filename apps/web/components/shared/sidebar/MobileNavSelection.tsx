"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { usePathname } from "next/navigation";

const SelectionContext = createContext<{
  selectedPath: string;
  select: (path: string) => void;
  finish: (path: string) => void;
} | null>(null);

export default function MobileNavSelection({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [destination, setDestination] = useState<string | null>(null);

  useEffect(() => setDestination(null), [pathname]);

  return (
    <SelectionContext.Provider
      value={{
        selectedPath: destination ?? pathname,
        select: setDestination,
        finish: (path) =>
          setDestination((current) => (current === path ? null : current)),
      }}
    >
      {children}
    </SelectionContext.Provider>
  );
}

export function useMobileNavSelection() {
  return useContext(SelectionContext);
}
