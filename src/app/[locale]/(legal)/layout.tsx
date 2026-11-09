import { setRequestLocale } from "next-intl/server";
import { MarketingFooter, MarketingHeader } from "@/features/marketing/marketing-chrome";

export default async function LegalLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <div className="min-h-dvh">
      <MarketingHeader />
      <main className="mx-auto max-w-2xl px-5 py-14">{children}</main>
      <MarketingFooter />
    </div>
  );
}
