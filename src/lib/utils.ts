import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function initials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "")).toUpperCase() || "?";
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

/** Premier jour du mois au format AAAA-MM-JJ. */
export function monthStart(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
}

export function isoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Interprète une date AAAA-MM-JJ à midi local : aucun décalage de jour selon le fuseau. */
export function parseDate(value: string): Date {
  return new Date(`${value.slice(0, 10)}T12:00:00`);
}

export function addMonths(period: string, delta: number): string {
  const d = parseDate(period);
  return monthStart(new Date(d.getFullYear(), d.getMonth() + delta, 1, 12));
}

export function safeFileName(name: string): string {
  const cleaned = name
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+/, "")
    .slice(-80);
  return cleaned || "fichier";
}

export function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) return String((error as { message: unknown }).message);
  return String(error);
}

/** Ne garde qu'un chemin interne. Le parseur retire tabulations et retours : on juge son résultat. */
export function safeInternalPath(next: string | null | undefined, fallback = "/app"): string {
  if (!next || !next.startsWith("/")) return fallback;
  const base = "http://internal.invalid";
  try {
    const url = new URL(next, base);
    return url.origin === base ? `${url.pathname}${url.search}${url.hash}` : fallback;
  } catch {
    return fallback;
  }
}

/** Vrai si le chemin reste dans le dossier de cette marque, sans remontée possible. */
export function isTenantPath(path: string, organizationId: string, brandId: string): boolean {
  return path.startsWith(`${organizationId}/${brandId}/`) && /^[\w./-]+$/.test(path) && !path.split("/").includes("..");
}
