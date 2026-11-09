"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { addMonths, parseDate } from "@/lib/utils";

export function MonthNav({ period, basePath }: { period: string; basePath: string }) {
  const format = useFormatter();
  const t = useTranslations("common");
  return (
    <div className="flex items-center gap-1">
      <Button variant="secondary" size="icon-sm" asChild>
        <Link href={`${basePath}?period=${addMonths(period, -1)}`} aria-label={t("previous_month")}>
          <ChevronLeft className="rtl:rotate-180" />
        </Link>
      </Button>
      <span className="min-w-32 text-center text-[13px] font-semibold capitalize">{format.dateTime(parseDate(period), { month: "long", year: "numeric" })}</span>
      <Button variant="secondary" size="icon-sm" asChild>
        <Link href={`${basePath}?period=${addMonths(period, 1)}`} aria-label={t("next_month")}>
          <ChevronRight className="rtl:rotate-180" />
        </Link>
      </Button>
    </div>
  );
}
