import { Check } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Logo } from "@/components/common/logo";
import { Link } from "@/i18n/navigation";

export default async function AuthLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("auth");
  const points = [t("panel_point_1"), t("panel_point_2"), t("panel_point_3")];

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_minmax(0,1.05fr)]">
      <main className="flex flex-col px-5 py-6 sm:px-10">
        <Link href="/" className="self-start">
          <Logo />
        </Link>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">{children}</div>
      </main>

      <aside className="relative hidden overflow-hidden bg-primary text-primary-foreground lg:flex lg:flex-col lg:justify-end lg:p-14">
        <div className="absolute -end-32 -top-32 size-[30rem] rounded-full bg-warm/90" />
        <div className="absolute inset-0 opacity-[0.07] [background-image:radial-gradient(currentColor_1px,transparent_1px)] [background-size:22px_22px]" />
        <div className="relative max-w-lg">
          <p className="text-[40px] leading-[1.1] font-semibold tracking-tight">
            {t.rich("panel_title", { em: (chunks) => <span className="display-italic">{chunks}</span> })}
          </p>
          <ul className="mt-8 space-y-3 text-[15px]">
            {points.map((point) => (
              <li key={point} className="flex items-start gap-3">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-white/15">
                  <Check className="size-3" />
                </span>
                {point}
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}
