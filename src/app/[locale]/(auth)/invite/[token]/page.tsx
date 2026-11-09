import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { AcceptInvite } from "@/features/workspaces/accept-invite";
import { Link } from "@/i18n/navigation";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { loadAppContext } from "@/server/context";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("invite");
  return { title: t("title"), robots: { index: false } };
}

export default async function InvitePage({ params }: { params: Promise<{ locale: string; token: string }> }) {
  const { locale, token } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("invite");
  const tRole = await getTranslations("roles");

  const preview = isSupabaseConfigured ? (await (await createClient()).rpc("get_invitation_preview", { p_token: token })).data?.[0] : undefined;
  const invalid = !preview || preview.is_used || preview.is_expired;

  if (invalid) {
    return (
      <>
        <h1 className="text-2xl font-semibold tracking-tight">{t("invalid_title")}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t("invalid_text")}</p>
      </>
    );
  }

  const ctx = await loadAppContext();
  const next = `/invite/${token}`;

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
      <p className="mt-2 mb-7 text-sm leading-relaxed text-muted-foreground">{t("text", { organization: preview.organization_name, role: tRole(preview.role) })}</p>

      {ctx ? (
        ctx.email.toLowerCase() === preview.email ? (
          <AcceptInvite token={token} />
        ) : (
          <p className="rounded-lg bg-warning-soft px-3 py-2.5 text-[13px] text-warning">{t("wrong_account", { email: preview.email })}</p>
        )
      ) : (
        <div className="space-y-2.5">
          <p className="mb-4 text-[13px] text-muted-foreground">{t("sign_in_as", { email: preview.email })}</p>
          <Button size="lg" className="w-full" asChild>
            <Link href={`/signup?next=${encodeURIComponent(next)}`}>{t("create_account")}</Link>
          </Button>
          <Button size="lg" variant="secondary" className="w-full" asChild>
            <Link href={`/login?next=${encodeURIComponent(next)}`}>{t("have_account")}</Link>
          </Button>
        </div>
      )}
    </>
  );
}
