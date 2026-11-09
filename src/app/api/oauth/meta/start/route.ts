import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { publicEnv } from "@/lib/env";
import { can } from "@/lib/rbac";
import { metaAuthorizeUrl, metaConfigured } from "@/server/connectors/meta";
import { loadAppContext } from "@/server/context";

export const META_STATE_COOKIE = "pp_meta_state";

/** Lance la connexion Facebook / Instagram, avec un état anti-CSRF lié au navigateur. */
export async function GET() {
  const ctx = await loadAppContext();
  if (!ctx) return NextResponse.redirect(`${publicEnv.appUrl}/login`);
  if (!ctx.brand || !can(ctx.role, "connectSocial") || !metaConfigured()) {
    return NextResponse.redirect(`${publicEnv.appUrl}/app/connections?error=forbidden`);
  }

  const state = randomBytes(24).toString("base64url");
  (await cookies()).set(META_STATE_COOKIE, `${state}.${ctx.brand.id}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/oauth/meta",
    maxAge: 600,
  });
  return NextResponse.redirect(metaAuthorizeUrl(state));
}
