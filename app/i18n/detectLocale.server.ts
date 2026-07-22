import { normalizeLocale, type SupportedLocale } from "./languages";

export const detectLocaleFromRequest = (request: Request): SupportedLocale => {
  const url = new URL(request.url);
  return normalizeLocale(url.searchParams.get("locale"));
};
