import { randomUUID, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { publicEnv } from "@/lib/env";
import { can } from "@/lib/rbac";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import { metaCompleteOAuth } from "@/server/connectors/meta";
import { loadAppContext } from "@/server/context";

const STATE_COOKIE = "pp_meta_state";

function sameValue(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Retour de Meta : les jetons partent au Vault, le navigateur ne reçoit qu'un identifiant de session. */
export async function GET(request: NextRequest) {
  const back = (query: string) => NextResponse.redirect(`${publicEnv.appUrl}/app/connections?${query}`);
  const { searchParams } = request.nextUrl;
  const store = await cookies();
  const [expectedState, brandId] = (store.get(STATE_COOKIE)?.value ?? "").split(".");
  store.delete({ name: STATE_COOKIE, path: "/api/oauth/meta" });

  const state = searchParams.get("state") ?? "";
  const code = searchParams.get("code");
  if (!expectedState || !sameValue(state, expectedState)) return back("error=oauth_state");
  if (!code) return back("error=oauth_cancelled");

  const ctx = await loadAppContext();
  if (!ctx || !can(ctx.role, "connectSocial") || !ctx.brands.some((b) => b.id === brandId)) return back("error=forbidden");

  try {
    const { candidates, tokens } = await metaCompleteOAuth(code);
    if (!candidates.length) return back("error=oauth_no_pages");

    const admin = createAdminClient();
    const { data: secretId, error: secretError } = await admin.rpc("vault_put", { p_name: `oauth:${randomUUID()}`, p_value: JSON.stringify(tokens) });
    if (secretError || !secretId) throw secretError ?? new Error("vault_put");

    const { data: session, error } = await admin
      .from("social_oauth_sessions")
      .insert({
        organization_id: ctx.organization.id,
        brand_id: brandId!,
        user_id: ctx.userId,
        provider: "meta",
        candidates: candidates as unknown as Json,
        secret_id: secretId,
      })
      .select("id")
      .single();
    if (error) throw error;
    return back(`session=${session.id}`);
  } catch (error) {
    console.error("[oauth:meta]", error);
    return back("error=oauth_failed");
  }
}
