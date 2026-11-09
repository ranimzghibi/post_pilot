import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ConnectionsView, type LibraryAsset } from "@/features/connections/connections-view";
import { can } from "@/lib/rbac";
import { isSandboxMode } from "@/server/connectors/service";
import { requireBrand } from "@/server/context";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("connections");
  return { title: t("title") };
}

type Candidate = { key: string; network: string; displayName: string; username: string | null; avatarUrl: string | null };

export default async function ConnectionsPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ session?: string; error?: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const ctx = await requireBrand();
  const { session: sessionId, error } = await searchParams;

  const [accounts, jobs, media, session] = await Promise.all([
    ctx.supabase.from("social_accounts").select("*").eq("brand_id", ctx.brand.id).order("created_at"),
    ctx.supabase.from("publication_jobs").select("id, status, caption, created_at, external_url, last_error, account:social_accounts(display_name, network)").eq("brand_id", ctx.brand.id).order("created_at", { ascending: false }).limit(10),
    ctx.supabase.from("media_assets").select("id, storage_path, alt").eq("brand_id", ctx.brand.id).eq("kind", "image").order("created_at", { ascending: false }).limit(24),
    sessionId && /^[0-9a-f-]{36}$/.test(sessionId) ? ctx.supabase.from("social_oauth_sessions").select("id, candidates").eq("id", sessionId).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  const paths = (media.data ?? []).map((m) => m.storage_path);
  const { data: signed } = paths.length ? await ctx.supabase.storage.from("media").createSignedUrls(paths, 3600) : { data: [] };
  const assets: LibraryAsset[] = (media.data ?? []).flatMap((m, i) => (signed?.[i]?.signedUrl ? [{ id: m.id, url: signed[i]!.signedUrl, alt: m.alt }] : []));

  return (
    <ConnectionsView
      accounts={accounts.data ?? []}
      jobs={jobs.data ?? []}
      assets={assets}
      sandbox={isSandboxMode()}
      canConnect={can(ctx.role, "connectSocial")}
      canPublish={can(ctx.role, "publishTest")}
      session={session.data ? { id: session.data.id, candidates: session.data.candidates as unknown as Candidate[] } : null}
      error={error ?? null}
    />
  );
}
