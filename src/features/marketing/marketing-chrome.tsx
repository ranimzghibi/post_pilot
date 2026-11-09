import { getTranslations } from "next-intl/server";
import { Logo } from "@/components/common/logo";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { LOCALE_LABELS, routing } from "@/i18n/routing";

export async function MarketingHeader({ path = "/" }: { path?: string }) {
  const t = await getTranslations("landing");
  return (
    <header className="sticky top-0 z-40 border-b border-transparent bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-5">
        <Link href="/">
          <Logo />
        </Link>
        <nav className="hidden items-center gap-6 text-[13px] text-muted-foreground md:flex">
          <Link href="/#loop" className="hover:text-foreground">
            {t("nav_how")}
          </Link>
          <Link href="/#features" className="hover:text-foreground">
            {t("nav_features")}
          </Link>
          <Link href="/#pricing" className="hover:text-foreground">
            {t("nav_pricing")}
          </Link>
        </nav>
        <div className="ms-auto flex items-center gap-1.5">
          <div className="hidden items-center gap-1 text-xs sm:flex">
            {routing.locales.map((code) => (
              <Link key={code} href={path} locale={code} className="rounded-md px-1.5 py-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
                {LOCALE_LABELS[code]}
              </Link>
            ))}
          </div>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/login">{t("login")}</Link>
          </Button>
          <Button size="sm" asChild>
            <Link href="/signup">{t("cta_short")}</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}

export async function MarketingFooter() {
  const t = await getTranslations("landing");
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-8 text-[13px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <Logo className="text-foreground" />
        <nav className="flex flex-wrap gap-5">
          <Link href="/privacy" className="hover:text-foreground">
            {t("footer_privacy")}
          </Link>
          <Link href="/terms" className="hover:text-foreground">
            {t("footer_terms")}
          </Link>
          <Link href="/data-deletion" className="hover:text-foreground">
            {t("footer_deletion")}
          </Link>
        </nav>
        <p>{t("footer_made")}</p>
      </div>
    </footer>
  );
}
