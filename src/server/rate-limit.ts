import "server-only";

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { AppError } from "./errors";

export type RateLimit = { name: string; limit: number; windowSeconds: number };

async function hit(key: string, rule: RateLimit): Promise<boolean> {
  // Une panne du limiteur ne doit pas bloquer le service.
  try {
    const { data, error } = await createAdminClient().rpc("check_rate_limit", {
      p_key: key,
      p_limit: rule.limit,
      p_window_seconds: rule.windowSeconds,
    });
    return error ? true : data !== false;
  } catch {
    return true;
  }
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

/** BNF : limitation de débit par utilisateur et par adresse IP. */
export async function enforceRateLimit(rule: RateLimit, userId: string | null): Promise<void> {
  const ip = await clientIp();
  const checks = [hit(`${rule.name}:ip:${ip}`, { ...rule, limit: rule.limit * 3 })];
  if (userId) checks.push(hit(`${rule.name}:user:${userId}`, rule));
  const results = await Promise.all(checks);
  if (results.includes(false)) throw new AppError("rate_limited");
}
