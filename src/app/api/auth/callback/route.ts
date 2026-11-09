import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { routing, type Locale } from "@/i18n/routing";
import { publicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { safeInternalPath } from "@/lib/utils";

function localized(path: string, locale: string | undefined): string {
  const valid = routing.locales.includes(locale as Locale) ? locale : routing.defaultLocale;
  return valid === routing.defaultLocale ? path : `/${valid}${path}`;
}

/** Retour des liens e-mail et d'OAuth : ouvre la session puis renvoie vers l'application. */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const next = safeInternalPath(searchParams.get("next"));
  const locale = (await cookies()).get("NEXT_LOCALE")?.value;
  const go = (path: string) => NextResponse.redirect(`${publicEnv.appUrl}${localized(path, locale)}`);

  const supabase = await createClient();
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    // Lien ouvert sur un autre appareil : l'adresse est confirmée mais la session n'est pas ouverte ici.
    if (error) return go("/login?notice=link_used");
    return go(next);
  }

  // La vérification attend un clic sur la page de confirmation, jamais un simple GET.
  if (tokenHash && type) {
    return go(`/confirm?token_hash=${encodeURIComponent(tokenHash)}&type=${encodeURIComponent(type)}&next=${encodeURIComponent(next)}`);
  }

  return go("/login?notice=link_invalid");
}
