import "server-only";

import { Resend } from "resend";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

type InvitationEmail = { to: string; organization: string; inviter: string; link: string; subject: string; body: string; cta: string };

/** Envoie l'invitation. Renvoie false si aucun service d'envoi n'est configuré. */
export async function sendInvitationEmail(email: InvitationEmail): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;

  const { error } = await new Resend(key).emails.send({
    from: process.env.EMAIL_FROM || "PostPilot <no-reply@example.com>",
    to: email.to,
    subject: email.subject,
    html: `<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px;color:#14161f">
      <p style="font-size:16px;line-height:1.6">${escapeHtml(email.body)}</p>
      <p style="margin:28px 0"><a href="${escapeHtml(email.link)}" style="background:#1f4fd8;color:#fff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:600">${escapeHtml(email.cta)}</a></p>
      <p style="font-size:12px;color:#6b7080">${escapeHtml(email.link)}</p>
    </div>`,
  });
  if (error) {
    console.error("[email]", error.message);
    return false;
  }
  return true;
}
