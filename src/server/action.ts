import "server-only";

import { isRedirectError } from "next/dist/client/components/redirect-error";
import type { z } from "zod";
import { can, type Permission } from "@/lib/rbac";
import { loadAppContext, type AppContext, type BrandContext } from "./context";
import { AppError, errorCode } from "./errors";
import { enforceRateLimit, type RateLimit } from "./rate-limit";

export type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; error: string; fields?: Record<string, string> };

type Options<S extends z.ZodType> = {
  schema: S;
  permission?: Permission;
  rateLimit?: RateLimit;
};

function fieldErrors(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    if (key && !fields[key]) fields[key] = issue.message;
  }
  return fields;
}

async function run<S extends z.ZodType, C extends AppContext, R>(
  options: Options<S>,
  raw: z.input<S>,
  guard: (ctx: AppContext) => C,
  handler: (input: z.output<S>, ctx: C) => Promise<R>,
): Promise<ActionResult<R>> {
  try {
    const parsed = options.schema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: "validation", fields: fieldErrors(parsed.error) };

    const ctx = await loadAppContext();
    if (!ctx) throw new AppError("not_authenticated");
    if (options.permission && !can(ctx.role, options.permission)) throw new AppError("forbidden");
    if (options.rateLimit) await enforceRateLimit(options.rateLimit, ctx.userId);

    return { ok: true, data: await handler(parsed.data, guard(ctx)) };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    const code = errorCode(error);
    if (code === "unexpected") console.error("[action]", error);
    return { ok: false, error: code };
  }
}

/** Action serveur authentifiée : validation Zod, contrôle du rôle, débit, erreurs normalisées. */
export function createAction<S extends z.ZodType, R>(options: Options<S>, handler: (input: z.output<S>, ctx: AppContext) => Promise<R>) {
  return async (raw: z.input<S>) => run(options, raw, (ctx) => ctx, handler);
}

/** Identique, pour les actions qui portent sur la marque active. */
export function createBrandAction<S extends z.ZodType, R>(options: Options<S>, handler: (input: z.output<S>, ctx: BrandContext) => Promise<R>) {
  return async (raw: z.input<S>) =>
    run(
      options,
      raw,
      (ctx) => {
        if (!ctx.brand) throw new AppError("no_brand");
        return ctx as BrandContext;
      },
      handler,
    );
}

/** Action sans session (connexion, inscription) : validation, débit par IP, erreurs normalisées. */
export function createPublicAction<S extends z.ZodType, R>(options: Pick<Options<S>, "schema" | "rateLimit">, handler: (input: z.output<S>) => Promise<R>) {
  return async (raw: z.input<S>): Promise<ActionResult<R>> => {
    try {
      const parsed = options.schema.safeParse(raw);
      if (!parsed.success) return { ok: false, error: "validation", fields: fieldErrors(parsed.error) };
      if (options.rateLimit) await enforceRateLimit(options.rateLimit, null);
      return { ok: true, data: await handler(parsed.data) };
    } catch (error) {
      if (isRedirectError(error)) throw error;
      const code = errorCode(error);
      if (code === "unexpected") console.error("[action]", error);
      return { ok: false, error: code };
    }
  };
}
