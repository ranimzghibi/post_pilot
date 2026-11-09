import { NextResponse, type NextRequest } from "next/server";
import { previewSchema } from "@/features/studio/schemas";
import { can } from "@/lib/rbac";
import { loadAppContext, type BrandContext } from "@/server/context";
import { errorCode } from "@/server/errors";
import { enforceRateLimit } from "@/server/rate-limit";
import { loadBrandVisuals, resolveSlide } from "@/server/render/brand-assets";
import { renderSlide } from "@/server/render/render";

export const runtime = "nodejs";

/** Aperçu JPEG basse définition d'une diapositive. */
export async function POST(request: NextRequest) {
  const ctx = await loadAppContext();
  if (!ctx) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  if (!ctx.brand) return NextResponse.json({ error: "no_brand" }, { status: 400 });
  if (!can(ctx.role, "editContent")) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = previewSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "validation" }, { status: 400 });

  try {
    await enforceRateLimit({ name: "preview", limit: 120, windowSeconds: 60 }, ctx.userId);
    const brandCtx = ctx as BrandContext;
    const { template, format, index, total, slide } = parsed.data;
    const [visuals, resolved] = await Promise.all([loadBrandVisuals(brandCtx), resolveSlide(brandCtx, slide, format)]);
    const jpeg = await renderSlide({ template, format, slide: resolved, identity: visuals.identity, logo: visuals.logo, brandName: ctx.brand.name, index, total }, { previewWidth: 720 });
    return new Response(new Uint8Array(jpeg), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "no-store" } });
  } catch (error) {
    const code = errorCode(error);
    if (code === "unexpected") console.error("[studio/preview]", error);
    return NextResponse.json({ error: code }, { status: code === "rate_limited" ? 429 : 500 });
  }
}
