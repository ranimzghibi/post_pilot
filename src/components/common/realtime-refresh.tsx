"use client";

import { useEffect } from "react";
import { useRouter } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";

/** Actualise la page quand une table change côté serveur (politiques RLS appliquées). */
export function RealtimeRefresh({ table, filter }: { table: "knowledge_documents"; filter: string }) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`${table}:${filter}`)
      .on("postgres_changes", { event: "*", schema: "public", table, filter }, () => router.refresh())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [table, filter, router]);

  return null;
}
