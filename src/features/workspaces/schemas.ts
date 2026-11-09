import { z } from "zod";

export const uuid = z.uuid();

export const profileSchema = z.object({
  fullName: z.string().trim().min(2, "required").max(120),
  locale: z.enum(["fr", "ar", "en"]),
  timezone: z.string().min(1).max(60),
});

export const workspaceSchema = z.object({ name: z.string().trim().min(1, "required").max(120) });

export const brandSchema = z.object({
  name: z.string().trim().min(1, "required").max(120),
  timezone: z.string().min(1).max(60).default("Africa/Tunis"),
  websiteUrl: z.union([z.url("invalid_url").max(2048), z.literal("")]).optional(),
});

export const inviteSchema = z.object({
  email: z.email("invalid_email").max(254).transform((v) => v.toLowerCase()),
  role: z.enum(["admin", "editor", "validator", "viewer"]),
});

export const TIMEZONES = ["Africa/Tunis", "Africa/Algiers", "Africa/Casablanca", "Africa/Tripoli", "Africa/Cairo", "Europe/Paris", "Europe/London", "Europe/Brussels", "Asia/Dubai", "Asia/Riyadh", "America/Montreal", "UTC"];
