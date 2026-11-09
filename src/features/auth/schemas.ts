import { z } from "zod";

const email = z.email("invalid_email").max(254);
const password = z.string().min(8, "password_min").max(72, "password_max");

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "required"),
  next: z.string().optional(),
});

export const signupSchema = z.object({
  fullName: z.string().trim().min(2, "required").max(120),
  email,
  password,
  locale: z.enum(["fr", "ar", "en"]),
  next: z.string().optional(),
});

export const forgotSchema = z.object({ email });

export const resetSchema = z
  .object({ password, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "password_mismatch" });
