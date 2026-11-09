import type { Database } from "@/lib/supabase/database.types";

export type OrgRole = Database["public"]["Enums"]["org_role"];

export const ROLES: OrgRole[] = ["owner", "admin", "editor", "validator", "viewer"];
export const INVITABLE_ROLES: OrgRole[] = ["admin", "editor", "validator", "viewer"];

/** Matrice des permissions, tableau 2.2 du rapport. La base applique les mêmes règles par RLS. */
const PERMISSIONS = {
  manageBilling: ["owner"],
  manageWorkspace: ["owner"],
  manageMembers: ["owner", "admin"],
  manageBrands: ["owner", "admin"],
  deleteBrand: ["owner"],
  connectSocial: ["owner", "admin"],
  editBrand: ["owner", "admin", "editor"],
  editContent: ["owner", "admin", "editor"],
  approveContent: ["owner", "admin", "validator"],
  publishTest: ["owner", "admin", "editor"],
} as const satisfies Record<string, readonly OrgRole[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: OrgRole | null | undefined, permission: Permission): boolean {
  return !!role && (PERMISSIONS[permission] as readonly OrgRole[]).includes(role);
}

export function rolesFor(permission: Permission): readonly OrgRole[] {
  return PERMISSIONS[permission];
}
