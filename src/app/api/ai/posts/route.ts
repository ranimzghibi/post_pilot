import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { CONTENT_LANGUAGES, NETWORK_LIST } from "@/lib/domain";
import { publicEnv } from "@/lib/env";
import { can } from "@/lib/rbac";
import { createAdminClient } from "@/lib/supabase/admin";
import { streamStructured } from "@/server/ai/run";
import { persistGeneration, prepareGeneration } from "@/server/content/generate";
import { loadAppContext, type BrandContext } from "@/server/context";
import { AppError, errorCode } from "@/server/errors";
import { enforceRateLimit } from "@/server/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 120;

const bodySchema = z.object({
  ideaId: z.uuid().nullish(),
  brief: z.string().trim().max(4000),
  language: z.enum(CONTENT_LANGUAGES),
  networks: z.array(z.enum(NETWORK_LIST as [string, ...string[]])).min(1),
});

/** Génère une publication et renvoie la progression en NDJSON : les premiers mots s'affichent aussitôt. */
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(publicEnv.appUrl).host && origin !== request.nextUrl.origin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const ctx = await loadAppContext();
  if (!ctx) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  if (!ctx.brand) return NextResponse.json({ error: "no_brand" }, { status: 400 });
  if (!can(ctx.role, "editContent")) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "validation" }, { status: 400 });
  const input = { ...parsed.data, networks: parsed.data.networks as typeof NETWORK_LIST };

  try {
    await enforceRateLimit({ name: "generate", limit: 30, windowSeconds: 60 }, ctx.userId);
  } catch (error) {
    return NextResponse.json({ error: errorCode(error) }, { status: 429 });
  }

  const admin = createAdminClient();
  const { error: quotaError } = await admin.rpc("consume_quota", { p_org: ctx.organization.id, p_kind: "posts", p_amount: 1 });
  if (quotaError) return NextResponse.json({ error: errorCode(quotaError) }, { status: 402 });

  const brandCtx = ctx as BrandContext;
  const encoder = new TextEncoder();

  const body = new ReadableStream({
    async start(controller) {
      const send = (message: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(message)}\n`));
      try {
        send({ type: "status", step: "context" });
        const prepared = await prepareGeneration(brandCtx, input);
        send({ type: "status", step: "writing" });

        const stream = streamStructured(prepared.request);
        for await (const partial of stream.partial) {
          send({ type: "partial", data: partial });
        }
        const { object, generationId } = await stream.final;

        send({ type: "status", step: "checking" });
        const postId = await persistGeneration(brandCtx, prepared, input, object, generationId);
        revalidatePath("/app/content");
        send({ type: "done", postId });
      } catch (error) {
        await admin.rpc("refund_quota", { p_org: ctx.organization.id, p_kind: "posts", p_amount: 1 });
        const code = error instanceof AppError ? error.code : errorCode(error);
        if (code === "unexpected") console.error("[ai/posts]", error);
        send({ type: "error", error: code });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(body, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
