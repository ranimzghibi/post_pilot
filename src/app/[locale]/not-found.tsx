import { Compass } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { Link } from "@/i18n/navigation";

export default async function NotFound() {
  const t = await getTranslations("common");
  return (
    <div className="mx-auto flex min-h-dvh max-w-xl items-center px-5">
      <EmptyState icon={Compass} title={t("not_found_title")} description={t("not_found_text")} className="w-full">
        <Button asChild>
          <Link href="/">{t("back_home")}</Link>
        </Button>
      </EmptyState>
    </div>
  );
}
