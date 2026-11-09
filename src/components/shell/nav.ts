import { BookOpen, CalendarDays, Compass, Fingerprint, LayoutDashboard, Megaphone, Palette, PenLine, Share2, Store, Users, UserRound, type LucideIcon } from "lucide-react";
import type { Permission } from "@/lib/rbac";

export type NavItem = { href: string; key: string; icon: LucideIcon; permission?: Permission };
export type NavGroup = { key: string; items: NavItem[] };

export const NAV_GROUPS: NavGroup[] = [
  { key: "overview", items: [{ href: "/app", key: "dashboard", icon: LayoutDashboard }] },
  {
    key: "brand",
    items: [
      { href: "/app/brand", key: "brand", icon: Fingerprint },
      { href: "/app/knowledge", key: "knowledge", icon: BookOpen },
      { href: "/app/news", key: "news", icon: Megaphone },
      { href: "/app/connections", key: "connections", icon: Share2 },
    ],
  },
  {
    key: "content",
    items: [
      { href: "/app/strategy", key: "strategy", icon: Compass },
      { href: "/app/calendar", key: "calendar", icon: CalendarDays },
      { href: "/app/content", key: "content", icon: PenLine },
      { href: "/app/studio", key: "studio", icon: Palette },
    ],
  },
  {
    key: "workspace",
    items: [
      { href: "/app/settings/team", key: "team", icon: Users },
      { href: "/app/settings/brands", key: "brands", icon: Store },
      { href: "/app/settings/profile", key: "profile", icon: UserRound },
    ],
  },
];
