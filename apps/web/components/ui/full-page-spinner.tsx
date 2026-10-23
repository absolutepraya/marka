"use client";

import React from "react";
import { MarkaStackLoader } from "@/components/loading-ui/marka-stack";
import { useTranslation } from "@/lib/i18n/client";

export function FullPageSpinner() {
  const { t } = useTranslation();
  return <MarkaStackLoader label={t("common.loading")} />;
}
