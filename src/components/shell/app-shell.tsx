"use client";

import { Check, ChevronsUpDown, Languages, LogOut, Menu, Moon, Plus, Search, Sparkles, Sun, UserRound } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { Command } from "cmdk";
import { useEffect, useState, useTransition } from "react";
import { Logo } from "@/components/common/logo";
import { useAction } from "@/components/common/use-action";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, SheetContent } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, Tooltip } from "@/components/ui/menu";
import { Avatar } from "@/components/ui/misc";
import { signOut } from "@/features/auth/actions";
import { switchBrand, switchOrganization } from "@/features/workspaces/actions";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { LOCALE_LABELS, routing, type Locale } from "@/i18n/routing";
import type { OrgRole } from "@/lib/rbac";
import { cn } from "@/lib/utils";
import { NAV_GROUPS } from "./nav";

export type ShellData = {
  user: { name: string; email: string; avatarUrl: string | null };
  role: OrgRole;
  organization: { id: string; name: string; plan: string };
  organizations: { id: string; name: string; role: OrgRole }[];
  brand: { id: string; name: string } | null;
  brands: { id: string; name: string }[];
  demo: { ai: boolean; social: boolean };
};

function isActive(pathname: string, href: string) {
  return href === "/app" ? pathname === "/app" : pathname === href || pathname.startsWith(`${href}/`);
}

function BrandSwitcher({ data }: { data: ShellData }) {
  const t = useTranslations("shell");
  const brand = useAction(switchBrand);
  const org = useAction(switchOrganization);
  const router = useRouter();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex w-full items-center gap-2.5 rounded-xl border bg-card p-2 text-start shadow-card transition-colors hover:bg-secondary">
        <Avatar name={data.brand?.name ?? data.organization.name} className="size-8 rounded-lg" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold">{data.brand?.name ?? t("no_brand")}</span>
          <span className="block truncate text-[11px] text-muted-foreground">{data.organization.name}</span>
        </span>
        <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>{t("brands")}</DropdownMenuLabel>
        {data.brands.map((item) => (
          <DropdownMenuItem key={item.id} onSelect={() => brand.run({ brandId: item.id })}>
            <Avatar name={item.name} className="size-5 rounded-md text-[9px]" />
            <span className="flex-1 truncate">{item.name}</span>
            {item.id === data.brand?.id && <Check className="text-primary!" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem onSelect={() => router.push("/app/settings/brands")}>
          <Plus />
          {t("add_brand")}
        </DropdownMenuItem>
        {data.organizations.length > 1 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>{t("workspaces")}</DropdownMenuLabel>
            {data.organizations.map((item) => (
              <DropdownMenuItem key={item.id} onSelect={() => org.run({ organizationId: item.id })}>
                <span className="flex-1 truncate">{item.name}</span>
                {item.id === data.organization.id && <Check className="text-primary!" />}
              </DropdownMenuItem>
            ))}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SidebarContent({ data, onNavigate }: { data: ShellData; onNavigate?: () => void }) {
  const t = useTranslations("nav");
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col gap-4 p-3">
      <Link href="/app" onClick={onNavigate} className="px-2 pt-1.5 pb-0.5">
        <Logo />
      </Link>
      <BrandSwitcher data={data} />
      <nav className="scrollbar-thin -mx-1 flex-1 space-y-5 overflow-y-auto px-1">
        {NAV_GROUPS.map((group) => (
          <div key={group.key}>
            <div className="overline-label px-2.5 pb-1.5">{t(`group_${group.key}`)}</div>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13px] font-medium transition-colors",
                        active ? "bg-card text-foreground shadow-card ring-1 ring-border" : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                      )}
                    >
                      <item.icon className={cn("size-4", active && "text-primary")} />
                      {t(item.key)}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </div>
  );
}

function CommandPalette({ data, open, onOpenChange }: { data: ShellData; open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useTranslations("nav");
  const tShell = useTranslations("shell");
  const router = useRouter();
  const brand = useAction(switchBrand);

  const item = "flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] aria-selected:bg-secondary [&_svg]:size-4 [&_svg]:text-muted-foreground";
  const group = "[&_[cmdk-group-heading]]:overline-label px-1 pb-1 [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:py-1.5";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl gap-0 p-0 [&>button]:hidden">
        <DialogTitle className="sr-only">{tShell("search")}</DialogTitle>
        <Command className="flex max-h-[60vh] flex-col">
          <div className="flex items-center gap-2 border-b px-4">
            <Search className="size-4 text-muted-foreground" />
            <Command.Input placeholder={tShell("search_placeholder")} className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
          </div>
          <Command.List className="scrollbar-thin overflow-y-auto p-1">
            <Command.Empty className="py-8 text-center text-[13px] text-muted-foreground">{tShell("no_results")}</Command.Empty>
            {NAV_GROUPS.map((navGroup) => (
              <Command.Group key={navGroup.key} heading={t(`group_${navGroup.key}`)} className={group}>
                {navGroup.items.map((entry) => (
                  <Command.Item
                    key={entry.href}
                    value={t(entry.key)}
                    className={item}
                    onSelect={() => {
                      onOpenChange(false);
                      router.push(entry.href);
                    }}
                  >
                    <entry.icon />
                    {t(entry.key)}
                  </Command.Item>
                ))}
              </Command.Group>
            ))}
            {data.brands.length > 1 && (
              <Command.Group heading={tShell("brands")} className={group}>
                {data.brands.map((entry) => (
                  <Command.Item
                    key={entry.id}
                    value={entry.name}
                    className={item}
                    onSelect={() => {
                      onOpenChange(false);
                      brand.run({ brandId: entry.id });
                    }}
                  >
                    <Avatar name={entry.name} className="size-5 rounded-md text-[9px]" />
                    {entry.name}
                  </Command.Item>
                ))}
              </Command.Group>
            )}
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

function UserMenu({ data }: { data: ShellData }) {
  const t = useTranslations("shell");
  const { resolvedTheme, setTheme } = useTheme();
  const locale = useLocale() as Locale;
  const pathname = usePathname();
  const router = useRouter();
  const [, start] = useTransition();
  const isDark = resolvedTheme === "dark";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label={t("account")} className="rounded-full">
        <Avatar name={data.user.name} src={data.user.avatarUrl} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <div className="px-2.5 py-2">
          <div className="truncate text-[13px] font-semibold">{data.user.name}</div>
          <div className="truncate text-xs text-muted-foreground" dir="ltr">
            {data.user.email}
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => router.push("/app/settings/profile")}>
          <UserRound />
          {t("profile")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setTheme(isDark ? "light" : "dark")}>
          {isDark ? <Sun /> : <Moon />}
          {isDark ? t("theme_light") : t("theme_dark")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="flex items-center gap-1.5">
          <Languages className="size-3" />
          {t("language")}
        </DropdownMenuLabel>
        {routing.locales.map((code) => (
          <DropdownMenuItem key={code} onSelect={() => start(() => router.replace(pathname, { locale: code }))}>
            <span className="flex-1">{LOCALE_LABELS[code]}</span>
            {code === locale && <Check className="text-primary!" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem destructive onSelect={() => start(() => signOut())}>
          <LogOut />
          {t("sign_out")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppShell({ data, children }: { data: ShellData; children: React.ReactNode }) {
  const t = useTranslations("shell");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const isDemo = data.demo.ai || data.demo.social;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[256px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-dvh border-e bg-sidebar lg:block">
        <SidebarContent data={data} />
      </aside>

      <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="start" className="w-72 bg-sidebar p-0">
          <DialogTitle className="sr-only">{t("menu")}</DialogTitle>
          <SidebarContent data={data} onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Dialog>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/85 px-4 backdrop-blur sm:px-6">
          <Button variant="ghost" size="icon-sm" className="lg:hidden" aria-label={t("menu")} onClick={() => setMobileOpen(true)}>
            <Menu />
          </Button>
          <button onClick={() => setPaletteOpen(true)} className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg border bg-card px-2.5 text-[13px] text-muted-foreground shadow-card transition-colors hover:bg-secondary sm:max-w-72">
            <Search className="size-3.5 shrink-0" />
            <span className="truncate">{t("search")}</span>
            <kbd className="ms-auto hidden rounded border bg-secondary px-1 font-mono text-[10px] sm:inline" dir="ltr">
              Ctrl K
            </kbd>
          </button>
          <div className="ms-auto flex items-center gap-2.5">
            {isDemo && (
              <Tooltip content={t("demo_tooltip")}>
                <span className="inline-flex items-center gap-1 rounded-full bg-warm-soft px-2 py-1 text-[11px] font-medium text-warm">
                  <Sparkles className="size-3" />
                  {t("demo")}
                </span>
              </Tooltip>
            )}
            <UserMenu data={data} />
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-7 sm:px-6 lg:px-8">{children}</main>
      </div>

      <CommandPalette data={data} open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}
