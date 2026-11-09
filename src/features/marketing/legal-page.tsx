import { getTranslations } from "next-intl/server";

/** Page légale rendue depuis le catalogue : un titre, une introduction, des sections numérotées. */
export async function LegalPage({ page, sections, children }: { page: "privacy" | "terms" | "deletion"; sections: number; children?: React.ReactNode }) {
  const t = await getTranslations("legal");
  return (
    <article>
      <h1 className="text-3xl font-semibold tracking-tight">{t(`${page}_title`)}</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{t(`${page}_intro`)}</p>
      {children}
      {Array.from({ length: sections }, (_, i) => i + 1).map((n) => (
        <section key={n} className="mt-8">
          <h2 className="text-[17px] font-semibold tracking-tight">{t(`${page}_h${n}`)}</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t(`${page}_p${n}`)}</p>
        </section>
      ))}
      <p className="mt-10 rounded-lg bg-warning-soft px-3 py-2.5 text-[13px] text-warning">{t("placeholder_notice")}</p>
    </article>
  );
}
