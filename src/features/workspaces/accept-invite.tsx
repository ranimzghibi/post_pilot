"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { acceptInvitation } from "./actions";

export function AcceptInvite({ token }: { token: string }) {
  const t = useTranslations("invite");
  const tErrors = useTranslations("errors");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      {error && <p className="rounded-lg bg-destructive-soft px-3 py-2.5 text-[13px] text-destructive">{tErrors.has(error) ? tErrors(error) : tErrors("unexpected")}</p>}
      <Button
        size="lg"
        className="w-full"
        loading={pending}
        onClick={() =>
          start(async () => {
            const result = await acceptInvitation(token);
            if (result.ok) router.push("/app");
            else setError(result.error);
          })
        }
      >
        {t("accept")}
      </Button>
    </div>
  );
}
