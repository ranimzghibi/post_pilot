"use server";

import { getLocale } from "next-intl/server";
import { z } from "zod";
import { redirect } from "@/i18n/navigation";
import { publicEnv } from "@/lib/env";
import { safeInternalPath as safeNext } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";
import { createPublicAction } from "@/server/action";
import { AppError } from "@/server/errors";
import { forgotSchema, loginSchema, resetSchema, signupSchema } from "./schemas";

const AUTH_LIMIT = { name: "auth", limit: 10, windowSeconds: 60 };

function authError(error: { code?: string; message: string }): AppError {
  const code = error.code ?? "";
  if (code === "invalid_credentials" || error.message.includes("Invalid login")) return new AppError("invalid_credentials");
  if (code === "email_not_confirmed" || error.message.includes("not confirmed")) return new AppError("email_not_confirmed");
  if (code === "user_already_exists" || error.message.includes("already registered")) return new AppError("already_registered");
  if (code === "weak_password") return new AppError("weak_password");
  if (code.includes("rate_limit")) return new AppError("rate_limited");
  console.error("[auth]", error.message);
  return new AppError("unexpected");
}

function callbackUrl(next: string) {
  return `${publicEnv.appUrl}/api/auth/callback?next=${encodeURIComponent(next)}`;
}

export const signIn = createPublicAction({ schema: loginSchema, rateLimit: AUTH_LIMIT }, async (input) => {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: input.email, password: input.password });
  if (error) throw authError(error);
  const locale = await getLocale();
  redirect({ href: safeNext(input.next), locale });
  return null;
});

export const signUp = createPublicAction({ schema: signupSchema, rateLimit: AUTH_LIMIT }, async (input) => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      data: { full_name: input.fullName, locale: input.locale },
      emailRedirectTo: callbackUrl(safeNext(input.next)),
    },
  });
  if (error) throw authError(error);

  // Confirmation désactivée sur le projet : la session existe déjà.
  if (data.session) {
    redirect({ href: safeNext(input.next), locale: input.locale });
  }
  return null;
});

export const requestPasswordReset = createPublicAction({ schema: forgotSchema, rateLimit: { name: "reset", limit: 5, windowSeconds: 300 } }, async (input) => {
  const supabase = await createClient();
  // Réponse identique que le compte existe ou non : aucune énumération possible.
  await supabase.auth.resetPasswordForEmail(input.email, { redirectTo: callbackUrl("/reset-password") });
  return null;
});

export const updatePassword = createPublicAction({ schema: resetSchema }, async (input) => {
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: input.password });
  if (error) throw authError(error);
  const locale = await getLocale();
  redirect({ href: "/app", locale });
  return null;
});

/**
 * Valide un lien reçu par e-mail. Ce traitement suit un clic explicite : un lien piégé
 * ne peut pas connecter une victime à un autre compte, et un antivirus qui précharge
 * le lien ne le consomme pas.
 */
export const confirmEmailToken = createPublicAction(
  {
    schema: z.object({ tokenHash: z.string().min(1).max(256), type: z.enum(["email", "signup", "recovery", "email_change", "magiclink", "invite"]), next: z.string().optional() }),
    rateLimit: AUTH_LIMIT,
  },
  async ({ tokenHash, type, next }) => {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error) throw new AppError("link_invalid");
    const locale = await getLocale();
    redirect({ href: type === "recovery" ? "/reset-password" : safeNext(next), locale });
    return null;
  },
);

export const signInWithGoogle = createPublicAction({ schema: z.object({ next: z.string().optional() }) }, async (input) => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: callbackUrl(safeNext(input.next)) },
  });
  if (error || !data.url) throw new AppError("unexpected");
  return { url: data.url };
});

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const locale = await getLocale();
  redirect({ href: "/login", locale });
}
