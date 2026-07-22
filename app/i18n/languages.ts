export const SUPPORTED_LOCALES = ["en", "es", "it", "de", "fr"] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const LANGUAGE_LABELS: Record<SupportedLocale, string> = {
  en: "English",
  es: "Español",
  it: "Italiano",
  de: "Deutsch",
  fr: "Français",
};

export const DEFAULT_LOCALE: SupportedLocale = "en";

export const normalizeLocale = (
  locale: string | null | undefined,
): SupportedLocale => {
  const base = (locale || "").split(/[-_]/)[0].toLowerCase();
  return (SUPPORTED_LOCALES as readonly string[]).includes(base)
    ? (base as SupportedLocale)
    : DEFAULT_LOCALE;
};
