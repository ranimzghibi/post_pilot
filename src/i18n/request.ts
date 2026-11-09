import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";

const CATALOGS = ["common", "landing", "auth", "workspace", "brand", "content"] as const;

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  const parts = await Promise.all(CATALOGS.map((name) => import(`../../messages/${locale}/${name}.json`)));
  return {
    locale,
    timeZone: "Africa/Tunis",
    messages: Object.assign({}, ...parts.map((part) => part.default)),
  };
});
