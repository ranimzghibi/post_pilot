/** Erreur métier : `code` correspond à une clé du catalogue `errors` des traductions. */
export class AppError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "AppError";
  }
}

const DATABASE_CODES = [
  "plan_limit_brands",
  "plan_limit_members",
  "plan_limit_social",
  "quota_exceeded",
  "last_owner",
  "owner_required",
  "invitation_invalid",
  "invitation_expired",
  "invitation_email_mismatch",
  "not_authenticated",
] as const;

/** Traduit une erreur quelconque en code affichable, sans exposer de détail technique. */
export function errorCode(error: unknown): string {
  if (error instanceof AppError) return error.code;
  const message = typeof error === "object" && error && "message" in error ? String(error.message) : "";
  const known = DATABASE_CODES.find((code) => message.includes(code));
  if (known) return known;
  const pgCode = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  if (pgCode === "42501" || message.includes("row-level security")) return "forbidden";
  if (pgCode === "23505") return "already_exists";
  return "unexpected";
}

/** Lève l'erreur renvoyée par une requête Supabase ; renvoie les données sinon. */
export function unwrap<R extends { data: unknown; error: unknown }>(result: R): NonNullable<R["data"]> {
  if (result.error) throw result.error;
  return result.data as NonNullable<R["data"]>;
}
