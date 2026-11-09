"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { MailCheck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { useForm, type FieldError } from "react-hook-form";
import type { z } from "zod";
import { useAction } from "@/components/common/use-action";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Link } from "@/i18n/navigation";
import { publicEnv } from "@/lib/env";
import { confirmEmailToken, requestPasswordReset, signIn, signInWithGoogle, signUp, updatePassword } from "./actions";
import { forgotSchema, loginSchema, resetSchema, signupSchema } from "./schemas";

function useFieldError() {
  const t = useTranslations("validation");
  return (error?: FieldError) => (error?.message ? (t.has(error.message) ? t(error.message) : error.message) : undefined);
}

function GoogleButton({ next }: { next?: string }) {
  const t = useTranslations("auth");
  const { run, pending } = useAction(signInWithGoogle, {
    onSuccess: ({ url }) => {
      window.location.href = url;
    },
  });
  if (!publicEnv.googleAuthEnabled) return null;
  return (
    <>
      <Button type="button" variant="secondary" className="w-full" loading={pending} onClick={() => run({ next })}>
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
          <path fill="#4285F4" d="M22.5 12.3c0-.8-.1-1.5-.2-2.3H12v4.4h5.9a5 5 0 0 1-2.2 3.3v2.7h3.5c2.1-1.9 3.3-4.8 3.3-8.1Z" />
          <path fill="#34A853" d="M12 23c3 0 5.5-1 7.2-2.7l-3.5-2.7c-1 .7-2.2 1-3.7 1-2.9 0-5.3-1.9-6.2-4.5H2.2v2.8A11 11 0 0 0 12 23Z" />
          <path fill="#FBBC05" d="M5.8 14.1a6.6 6.6 0 0 1 0-4.2V7.1H2.2a11 11 0 0 0 0 9.8l3.6-2.8Z" />
          <path fill="#EA4335" d="M12 5.4c1.6 0 3 .6 4.1 1.6l3.1-3.1A11 11 0 0 0 2.2 7.1l3.6 2.8C6.7 7.3 9.1 5.4 12 5.4Z" />
        </svg>
        {t("google")}
      </Button>
      <div className="relative my-5 text-center text-xs text-muted-foreground">
        <span className="absolute inset-x-0 top-1/2 h-px bg-border" />
        <span className="relative bg-background px-3">{t("or")}</span>
      </div>
    </>
  );
}

export function LoginForm({ next }: { next?: string }) {
  const t = useTranslations("auth");
  const fieldError = useFieldError();
  const form = useForm<z.infer<typeof loginSchema>>({ resolver: zodResolver(loginSchema), defaultValues: { email: "", password: "", next } });
  const { run, pending } = useAction(signIn);

  return (
    <div>
      <GoogleButton next={next} />
      <form onSubmit={form.handleSubmit((values) => run(values))} className="space-y-4" noValidate>
        <Field label={t("email")} htmlFor="email" error={fieldError(form.formState.errors.email)}>
          <Input id="email" type="email" autoComplete="email" dir="ltr" className="rtl:text-right" {...form.register("email")} aria-invalid={!!form.formState.errors.email} />
        </Field>
        <Field label={t("password")} htmlFor="password" error={fieldError(form.formState.errors.password)}>
          <Input id="password" type="password" autoComplete="current-password" dir="ltr" {...form.register("password")} aria-invalid={!!form.formState.errors.password} />
        </Field>
        <div className="text-end">
          <Link href="/forgot-password" className="text-[13px] text-primary hover:underline">
            {t("forgot_link")}
          </Link>
        </div>
        <Button type="submit" size="lg" className="w-full" loading={pending}>
          {t("login_submit")}
        </Button>
      </form>
    </div>
  );
}

export function SignupForm({ next }: { next?: string }) {
  const t = useTranslations("auth");
  const locale = useLocale() as "fr" | "ar" | "en";
  const fieldError = useFieldError();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const form = useForm<z.infer<typeof signupSchema>>({ resolver: zodResolver(signupSchema), defaultValues: { fullName: "", email: "", password: "", locale, next } });
  const { run, pending } = useAction(signUp, { onSuccess: () => setSentTo(form.getValues("email")) });

  if (sentTo) {
    return (
      <div className="animate-rise rounded-2xl border bg-card p-6 text-center shadow-card">
        <span className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
          <MailCheck className="size-5" />
        </span>
        <h2 className="font-semibold">{t("verify_title")}</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t("verify_body", { email: sentTo })}</p>
      </div>
    );
  }

  return (
    <div>
      <GoogleButton next={next} />
      <form onSubmit={form.handleSubmit((values) => run(values))} className="space-y-4" noValidate>
        <Field label={t("full_name")} htmlFor="fullName" error={fieldError(form.formState.errors.fullName)}>
          <Input id="fullName" autoComplete="name" {...form.register("fullName")} aria-invalid={!!form.formState.errors.fullName} />
        </Field>
        <Field label={t("email")} htmlFor="email" error={fieldError(form.formState.errors.email)}>
          <Input id="email" type="email" autoComplete="email" dir="ltr" {...form.register("email")} aria-invalid={!!form.formState.errors.email} />
        </Field>
        <Field label={t("password")} htmlFor="password" hint={t("password_hint")} error={fieldError(form.formState.errors.password)}>
          <Input id="password" type="password" autoComplete="new-password" dir="ltr" {...form.register("password")} aria-invalid={!!form.formState.errors.password} />
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={pending}>
          {t("signup_submit")}
        </Button>
        <p className="text-center text-xs leading-relaxed text-muted-foreground">
          {t.rich("legal_notice", {
            terms: (chunks) => (
              <Link href="/terms" className="underline">
                {chunks}
              </Link>
            ),
            privacy: (chunks) => (
              <Link href="/privacy" className="underline">
                {chunks}
              </Link>
            ),
          })}
        </p>
      </form>
    </div>
  );
}

export function ForgotForm() {
  const t = useTranslations("auth");
  const fieldError = useFieldError();
  const [sent, setSent] = useState(false);
  const form = useForm<z.infer<typeof forgotSchema>>({ resolver: zodResolver(forgotSchema), defaultValues: { email: "" } });
  const { run, pending } = useAction(requestPasswordReset, { onSuccess: () => setSent(true) });

  if (sent) {
    return (
      <div className="animate-rise rounded-2xl border bg-card p-6 text-center shadow-card">
        <span className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
          <MailCheck className="size-5" />
        </span>
        <p className="text-sm leading-relaxed text-muted-foreground">{t("forgot_sent")}</p>
      </div>
    );
  }

  return (
    <form onSubmit={form.handleSubmit((values) => run(values))} className="space-y-4" noValidate>
      <Field label={t("email")} htmlFor="email" error={fieldError(form.formState.errors.email)}>
        <Input id="email" type="email" autoComplete="email" dir="ltr" {...form.register("email")} aria-invalid={!!form.formState.errors.email} />
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={pending}>
        {t("forgot_submit")}
      </Button>
    </form>
  );
}

export function ResetForm() {
  const t = useTranslations("auth");
  const fieldError = useFieldError();
  const form = useForm<z.infer<typeof resetSchema>>({ resolver: zodResolver(resetSchema), defaultValues: { password: "", confirm: "" } });
  const { run, pending } = useAction(updatePassword);

  return (
    <form onSubmit={form.handleSubmit((values) => run(values))} className="space-y-4" noValidate>
      <Field label={t("new_password")} htmlFor="password" hint={t("password_hint")} error={fieldError(form.formState.errors.password)}>
        <Input id="password" type="password" autoComplete="new-password" dir="ltr" {...form.register("password")} aria-invalid={!!form.formState.errors.password} />
      </Field>
      <Field label={t("confirm_password")} htmlFor="confirm" error={fieldError(form.formState.errors.confirm)}>
        <Input id="confirm" type="password" autoComplete="new-password" dir="ltr" {...form.register("confirm")} aria-invalid={!!form.formState.errors.confirm} />
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={pending}>
        {t("reset_submit")}
      </Button>
    </form>
  );
}

export function ConfirmForm({ tokenHash, type, next }: { tokenHash: string; type: "email" | "signup" | "recovery" | "email_change" | "magiclink" | "invite"; next?: string }) {
  const t = useTranslations("auth");
  const { run, pending } = useAction(confirmEmailToken);
  return (
    <Button size="lg" className="w-full" loading={pending} onClick={() => run({ tokenHash, type, next })}>
      {t("confirm_submit")}
    </Button>
  );
}
