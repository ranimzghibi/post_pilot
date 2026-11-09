import { setRequestLocale } from "next-intl/server";
import { AppShell, type ShellData } from "@/components/shell/app-shell";
import { aiProvider } from "@/server/ai/config";
import { isSandboxMode } from "@/server/connectors/service";
import { requireContext } from "@/server/context";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const ctx = await requireContext();

  const data: ShellData = {
    user: { name: ctx.profile.full_name ?? ctx.email, email: ctx.email, avatarUrl: ctx.profile.avatar_url },
    role: ctx.role,
    organization: { id: ctx.organization.id, name: ctx.organization.name, plan: ctx.organization.plan },
    organizations: ctx.memberships.map((m) => ({ id: m.organization.id, name: m.organization.name, role: m.role })),
    brand: ctx.brand ? { id: ctx.brand.id, name: ctx.brand.name } : null,
    brands: ctx.brands.map((b) => ({ id: b.id, name: b.name })),
    demo: { ai: aiProvider() === "demo", social: isSandboxMode() },
  };

  return <AppShell data={data}>{children}</AppShell>;
}
