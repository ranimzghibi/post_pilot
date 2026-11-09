import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageHeader } from "@/components/ui/misc";
import { TeamManager } from "@/features/workspaces/settings-forms";
import { can } from "@/lib/rbac";
import { requireContext } from "@/server/context";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings.team");
  return { title: t("title") };
}

export default async function TeamPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const ctx = await requireContext();
  const t = await getTranslations("settings.team");
  const canManage = can(ctx.role, "manageMembers");

  const [{ data: members }, { data: invitations }] = await Promise.all([
    ctx.supabase.from("memberships").select("id, role, user_id, profile:profiles(full_name, email, avatar_url)").eq("organization_id", ctx.organization.id).order("created_at"),
    canManage
      ? ctx.supabase.from("invitations").select("id, email, role, expires_at").eq("organization_id", ctx.organization.id).is("accepted_at", null).is("revoked_at", null).gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);

  return (
    <>
      <PageHeader eyebrow={ctx.organization.name} title={t("title")} description={t("subtitle")} />
      <TeamManager
        members={(members ?? []).map((m) => ({ id: m.id, role: m.role, userId: m.user_id, name: m.profile.full_name ?? m.profile.email, email: m.profile.email, avatarUrl: m.profile.avatar_url }))}
        invitations={(invitations ?? []).map((i) => ({ id: i.id, email: i.email, role: i.role, expiresAt: i.expires_at }))}
        canManage={canManage}
        viewerRole={ctx.role}
        viewerId={ctx.userId}
        maxMembers={ctx.plan.max_members}
      />
    </>
  );
}
