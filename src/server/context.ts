import "server-only";

import { cookies } from "next/headers";
import { getLocale } from "next-intl/server";
import { cache } from "react";
import { redirect } from "@/i18n/navigation";
import { isSupabaseConfigured } from "@/lib/env";
import type { OrgRole } from "@/lib/rbac";
import type { Database } from "@/lib/supabase/database.types";
import { createClient, type UserClient } from "@/lib/supabase/server";

type Tables = Database["public"]["Tables"];
export type Profile = Tables["profiles"]["Row"];
export type Organization = Tables["organizations"]["Row"];
export type Brand = Tables["brands"]["Row"];
export type Plan = Tables["plans"]["Row"];

export const ORG_COOKIE = "pp_org";
export const BRAND_COOKIE = "pp_brand";

export type WorkspaceMembership = { organization: Organization; role: OrgRole };

export type AppContext = {
  supabase: UserClient;
  userId: string;
  email: string;
  profile: Profile;
  memberships: WorkspaceMembership[];
  organization: Organization;
  role: OrgRole;
  plan: Plan;
  brands: Brand[];
  brand: Brand | null;
};

/** Contexte de la requête : utilisateur, espace et marque actifs. Résolu une fois par rendu. */
export const loadAppContext = cache(async (): Promise<AppContext | null> => {
  if (!isSupabaseConfigured) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: profile }, { data: rows }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase.from("memberships").select("role, organization:organizations(*)").eq("user_id", user.id).order("created_at"),
  ]);
  if (!profile || !rows?.length) return null;

  const memberships = rows.map((r) => ({ organization: r.organization, role: r.role }));
  const store = await cookies();
  const wantedOrg = store.get(ORG_COOKIE)?.value;
  const active = memberships.find((m) => m.organization.id === wantedOrg) ?? memberships[0]!;

  const [{ data: brands }, { data: plan }] = await Promise.all([
    supabase.from("brands").select("*").eq("organization_id", active.organization.id).order("created_at"),
    supabase.from("plans").select("*").eq("code", active.organization.plan).single(),
  ]);
  if (!plan) return null;

  const wantedBrand = store.get(BRAND_COOKIE)?.value;
  const list = brands ?? [];

  return {
    supabase,
    userId: user.id,
    email: user.email ?? profile.email,
    profile,
    memberships,
    organization: active.organization,
    role: active.role,
    plan,
    brands: list,
    brand: list.find((b) => b.id === wantedBrand) ?? list[0] ?? null,
  };
});

/** Pour les pages de l'application : redirige vers la connexion sans session. */
export async function requireContext(): Promise<AppContext> {
  const ctx = await loadAppContext();
  if (!ctx) {
    const locale = await getLocale();
    redirect({ href: "/login", locale });
  }
  return ctx as AppContext;
}

export type BrandContext = AppContext & { brand: Brand };

/** Pour les pages qui exigent une marque : renvoie vers l'onboarding s'il n'y en a pas. */
export async function requireBrand(): Promise<BrandContext> {
  const ctx = await requireContext();
  if (!ctx.brand) {
    const locale = await getLocale();
    redirect({ href: "/app/onboarding", locale });
  }
  return ctx as BrandContext;
}
