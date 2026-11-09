import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { publicEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { metaParseSignedRequest } from "@/server/connectors/meta";

/**
 * Rappels Meta « désautorisation » et « suppression des données » (exigés par la revue
 * d'application) : la signature est vérifiée, puis comptes et jetons sont supprimés.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.META_APP_SECRET;
  if (!secret) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const form = await request.formData();
  const signed = form.get("signed_request");
  const payload = typeof signed === "string" ? metaParseSignedRequest(signed, secret) : null;
  if (!payload?.user_id) return NextResponse.json({ error: "invalid_signature" }, { status: 400 });

  // Le déclencheur `social_accounts_purge` efface les jetons du Vault.
  await createAdminClient().from("social_accounts").delete().eq("provider_user_id", payload.user_id);

  const confirmation = createHash("sha256").update(payload.user_id).digest("hex").slice(0, 16);
  return NextResponse.json({ url: `${publicEnv.appUrl}/data-deletion?code=${confirmation}`, confirmation_code: confirmation });
}
