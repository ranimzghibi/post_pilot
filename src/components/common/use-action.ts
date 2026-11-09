"use client";

import { useTranslations } from "next-intl";
import { useCallback, useTransition } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/server/action";

type Options<O> = {
  onSuccess?: (data: O) => void;
  onError?: (result: Extract<ActionResult<O>, { ok: false }>) => void;
  success?: string;
  silent?: boolean;
};

/** Exécute une action serveur : état d'attente, message d'erreur traduit, toast de réussite. */
export function useAction<I, O>(action: (input: I) => Promise<ActionResult<O>>, options: Options<O> = {}) {
  const [pending, start] = useTransition();
  const t = useTranslations("errors");
  const { onSuccess, onError, success, silent } = options;

  const run = useCallback(
    (input: I) =>
      new Promise<ActionResult<O>>((resolve) => {
        start(async () => {
          const result = await action(input);
          if (result.ok) {
            if (success) toast.success(success);
            onSuccess?.(result.data);
          } else {
            if (!silent) toast.error(t.has(result.error) ? t(result.error) : t("unexpected"));
            onError?.(result);
          }
          resolve(result);
        });
      }),
    [action, onSuccess, onError, success, silent, t],
  );

  return { run, pending };
}
