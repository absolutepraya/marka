import { getUserLocalSettings } from "@/lib/userLocalSettings/userLocalSettings";
import { createInstance } from "i18next";
import resourcesToBackend from "i18next-resources-to-backend";
import { initReactI18next } from "react-i18next/initReactI18next";

import { defaultNS, getOptions } from "./settings";

const initI18next = async (lng: string) => {
  const i18nInstance = createInstance();
  await i18nInstance
    .use(initReactI18next)
    .use(
      resourcesToBackend(
        (language: string, namespace: string) =>
          import(`./locales/${language}/${namespace}.json`),
      ),
    )
    .init(getOptions(lng, defaultNS));
  return i18nInstance;
};

export async function useTranslation(language?: string) {
  const lng = language ?? (await getUserLocalSettings()).lang;
  const i18nextInstance = await initI18next(lng);
  return {
    t: i18nextInstance.getFixedT(lng, defaultNS),
    i18n: i18nextInstance,
  };
}
