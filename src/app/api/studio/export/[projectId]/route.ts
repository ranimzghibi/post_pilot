import { zipSync } from "fflate";
import { NextResponse, type NextRequest } from "next/server";
import { loadAppContext } from "@/server/context";

export const runtime = "nodejs";

/** Archive ZIP des JPEG d'un projet : l'accès passe par RLS et par les politiques de stockage. */
export async function GET(_: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(projectId)) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const ctx = await loadAppContext();
  if (!ctx) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  const { data: assets } = await ctx.supabase.from("media_assets").select("storage_path").eq("project_id", projectId);
  if (!assets?.length) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const files: Record<string, Uint8Array> = {};
  await Promise.all(
    assets.map(async (asset) => {
      const { data } = await ctx.supabase.storage.from("media").download(asset.storage_path);
      if (data) files[asset.storage_path.split("/").pop()!] = new Uint8Array(await data.arrayBuffer());
    }),
  );

  const zip = zipSync(files, { level: 0 });
  return new Response(new Uint8Array(zip), {
    headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="postpilot-${projectId.slice(0, 8)}.zip"` },
  });
}
