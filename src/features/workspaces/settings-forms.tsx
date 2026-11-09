"use client";

import { Copy, MailPlus, Plus, Trash2, X } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { useAction } from "@/components/common/use-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/menu";
import { Avatar } from "@/components/ui/misc";
import { usePathname, useRouter } from "@/i18n/navigation";
import { LOCALE_LABELS, routing, type Locale } from "@/i18n/routing";
import { INVITABLE_ROLES, ROLES, type OrgRole } from "@/lib/rbac";
import { changeMemberRole, createBrand, deleteBrand, inviteMember, removeMember, revokeInvitation, updateBrand, updateProfile, updateWorkspace } from "./actions";
import { TIMEZONES } from "./schemas";

export function ProfileForm({ fullName, locale, timezone, email }: { fullName: string; locale: string; timezone: string; email: string }) {
  const t = useTranslations("settings.profile");
  const router = useRouter();
  const pathname = usePathname();
  const current = useLocale();
  const [name, setName] = useState(fullName);
  const [language, setLanguage] = useState(locale);
  const [zone, setZone] = useState(timezone);
  const save = useAction(updateProfile, {
    success: t("saved"),
    onSuccess: (data) => {
      if (data.locale !== current) router.replace(pathname, { locale: data.locale as Locale });
    },
  });

  return (
    <Card className="max-w-xl">
      <CardContent className="space-y-4">
        <Field label={t("email")} htmlFor="pfEmail">
          <Input id="pfEmail" value={email} disabled dir="ltr" />
        </Field>
        <Field label={t("name")} htmlFor="pfName">
          <Input id="pfName" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={t("language")} htmlFor="pfLocale">
          <Select id="pfLocale" value={language} onValueChange={setLanguage} options={routing.locales.map((value) => ({ value, label: LOCALE_LABELS[value] }))} />
        </Field>
        <Field label={t("timezone")} htmlFor="pfZone">
          <Select id="pfZone" value={zone} onValueChange={setZone} options={Array.from(new Set([zone, ...TIMEZONES])).map((value) => ({ value, label: value }))} />
        </Field>
        <Button loading={save.pending} disabled={name.trim().length < 2} onClick={() => save.run({ fullName: name, locale: language as Locale, timezone: zone })}>
          {t("save")}
        </Button>
      </CardContent>
    </Card>
  );
}

type Member = { id: string; role: OrgRole; userId: string; name: string; email: string; avatarUrl: string | null };
type Invitation = { id: string; email: string; role: OrgRole; expiresAt: string };

export function TeamManager({ members, invitations, canManage, viewerRole, viewerId, maxMembers }: { members: Member[]; invitations: Invitation[]; canManage: boolean; viewerRole: OrgRole; viewerId: string; maxMembers: number }) {
  const t = useTranslations("settings.team");
  const tRole = useTranslations("roles");
  const format = useFormatter();
  const router = useRouter();
  const refresh = () => router.refresh();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Exclude<OrgRole, "owner">>("editor");
  const [link, setLink] = useState<string | null>(null);

  const invite = useAction(inviteMember, {
    onSuccess: (data) => {
      refresh();
      if (data.sent) {
        toast.success(t("invite_sent"));
        setOpen(false);
        setEmail("");
      } else {
        setLink(data.link);
      }
    },
  });
  const change = useAction(changeMemberRole, { success: t("role_changed"), onSuccess: refresh });
  const remove = useAction(removeMember, { success: t("removed"), onSuccess: refresh });
  const revoke = useAction(revokeInvitation, { onSuccess: refresh });

  const roleOptions = (viewerRole === "owner" ? ROLES : ROLES.filter((r) => r !== "owner")).map((value) => ({ value, label: tRole(value) }));
  const used = members.length + invitations.length;

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>{t("members")}</CardTitle>
            <CardDescription>{t("seats", { used, max: maxMembers })}</CardDescription>
          </div>
          {canManage && (
            <Dialog
              open={open}
              onOpenChange={(next) => {
                setOpen(next);
                if (!next) {
                  setLink(null);
                  setEmail("");
                }
              }}
            >
              <DialogTrigger asChild>
                <Button size="sm">
                  <MailPlus />
                  {t("invite")}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t("invite_title")}</DialogTitle>
                  <DialogDescription>{t("invite_text")}</DialogDescription>
                </DialogHeader>
                {link ? (
                  <div className="space-y-3">
                    <p className="text-[13px] text-muted-foreground">{t("invite_link_text")}</p>
                    <div className="flex gap-2">
                      <Input value={link} readOnly dir="ltr" aria-label={t("invite_link")} />
                      <Button
                        variant="secondary"
                        size="icon"
                        aria-label={t("copy")}
                        onClick={() => {
                          navigator.clipboard.writeText(link);
                          toast.success(t("copied"));
                        }}
                      >
                        <Copy />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="space-y-4">
                      <Field label={t("email")} htmlFor="invEmail">
                        <Input id="invEmail" type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nom@exemple.tn" />
                      </Field>
                      <Field label={t("role")} htmlFor="invRole" hint={t(`role_hint_${role}`)}>
                        <Select id="invRole" value={role} onValueChange={(value) => setRole(value as typeof role)} options={INVITABLE_ROLES.map((value) => ({ value, label: tRole(value) }))} />
                      </Field>
                    </div>
                    <DialogFooter>
                      <Button loading={invite.pending} onClick={() => invite.run({ email, role })}>
                        {t("invite_submit")}
                      </Button>
                    </DialogFooter>
                  </>
                )}
              </DialogContent>
            </Dialog>
          )}
        </CardHeader>
        <CardContent className="pt-3">
          <ul className="divide-y">
            {members.map((member) => {
              const editable = canManage && member.userId !== viewerId && (member.role !== "owner" || viewerRole === "owner");
              return (
                <li key={member.id} className="flex items-center gap-3 py-2.5">
                  <Avatar name={member.name} src={member.avatarUrl} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium">{member.name}</div>
                    <div className="truncate text-xs text-muted-foreground" dir="ltr">
                      {member.email}
                    </div>
                  </div>
                  {editable ? (
                    <>
                      <Select aria-label={t("role")} className="w-40" value={member.role} onValueChange={(value) => change.run({ membershipId: member.id, role: value as OrgRole })} options={roleOptions} />
                      <ConfirmDialog
                        trigger={
                          <Button variant="ghost" size="icon-sm" aria-label={t("remove")}>
                            <Trash2 />
                          </Button>
                        }
                        title={t("remove_title", { name: member.name })}
                        confirmLabel={t("remove")}
                        loading={remove.pending}
                        onConfirm={() => remove.run({ membershipId: member.id })}
                      />
                    </>
                  ) : (
                    <Badge variant={member.role === "owner" ? "primary" : "neutral"}>{tRole(member.role)}</Badge>
                  )}
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      {canManage && invitations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("pending")}</CardTitle>
          </CardHeader>
          <CardContent className="pt-3">
            <ul className="divide-y">
              {invitations.map((invitation) => (
                <li key={invitation.id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium" dir="ltr">
                      {invitation.email}
                    </div>
                    <div className="text-xs text-muted-foreground">{t("expires", { date: format.dateTime(new Date(invitation.expiresAt), { dateStyle: "medium" }) })}</div>
                  </div>
                  <Badge>{tRole(invitation.role)}</Badge>
                  <Button variant="ghost" size="icon-sm" aria-label={t("revoke")} loading={revoke.pending} onClick={() => revoke.run({ id: invitation.id })}>
                    {!revoke.pending && <X />}
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

type BrandItem = { id: string; name: string; timezone: string; website_url: string | null };

export function BrandsManager({ brands, workspaceName, canManageBrands, canDeleteBrand, canRenameWorkspace, maxBrands }: { brands: BrandItem[]; workspaceName: string; canManageBrands: boolean; canDeleteBrand: boolean; canRenameWorkspace: boolean; maxBrands: number }) {
  const t = useTranslations("settings.brands");
  const router = useRouter();
  const refresh = () => router.refresh();
  const [workspace, setWorkspace] = useState(workspaceName);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<BrandItem | null>(null);

  const rename = useAction(updateWorkspace, { success: t("saved"), onSuccess: refresh });
  const create = useAction(createBrand, {
    success: t("created"),
    onSuccess: () => {
      setCreating(false);
      setName("");
      router.push("/app/onboarding");
    },
  });
  const update = useAction(updateBrand, {
    success: t("saved"),
    onSuccess: () => {
      setEditing(null);
      refresh();
    },
  });
  const remove = useAction(deleteBrand, { success: t("deleted"), onSuccess: refresh });

  return (
    <div className="max-w-3xl space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>{t("workspace")}</CardTitle>
        </CardHeader>
        <CardContent className="flex items-end gap-2">
          <Field label={t("workspace_name")} htmlFor="wsName" className="flex-1">
            <Input id="wsName" value={workspace} maxLength={120} disabled={!canRenameWorkspace} onChange={(e) => setWorkspace(e.target.value)} />
          </Field>
          {canRenameWorkspace && (
            <Button variant="secondary" loading={rename.pending} disabled={!workspace.trim() || workspace === workspaceName} onClick={() => rename.run({ name: workspace })}>
              {t("save")}
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>{t("brands")}</CardTitle>
            <CardDescription>{t("count", { used: brands.length, max: maxBrands })}</CardDescription>
          </div>
          {canManageBrands && (
            <Button size="sm" disabled={brands.length >= maxBrands} onClick={() => setCreating(true)}>
              <Plus />
              {t("add")}
            </Button>
          )}
        </CardHeader>
        <CardContent className="pt-3">
          <ul className="divide-y">
            {brands.map((brand) => (
              <li key={brand.id} className="flex items-center gap-3 py-2.5">
                <Avatar name={brand.name} className="rounded-lg" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium">{brand.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{brand.website_url ?? brand.timezone}</div>
                </div>
                {canManageBrands && (
                  <Button variant="ghost" size="sm" onClick={() => setEditing(brand)}>
                    {t("edit")}
                  </Button>
                )}
                {canDeleteBrand && (
                  <ConfirmDialog
                    trigger={
                      <Button variant="ghost" size="icon-sm" aria-label={t("delete")}>
                        <Trash2 />
                      </Button>
                    }
                    title={t("delete_title", { name: brand.name })}
                    description={t("delete_text", { name: brand.name })}
                    confirmLabel={t("delete")}
                    typeToConfirm={brand.name}
                    loading={remove.pending}
                    onConfirm={() => remove.run({ id: brand.id })}
                  />
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("add")}</DialogTitle>
          </DialogHeader>
          <Field label={t("name")} htmlFor="newBrand">
            <Input id="newBrand" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
          </Field>
          <DialogFooter>
            <Button loading={create.pending} disabled={!name.trim()} onClick={() => create.run({ name, timezone: "Africa/Tunis", websiteUrl: "" })}>
              {t("create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(next) => !next && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("edit")}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <Field label={t("name")} htmlFor="edName">
                <Input id="edName" value={editing.name} maxLength={120} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
              </Field>
              <Field label={t("website")} htmlFor="edSite">
                <Input id="edSite" dir="ltr" value={editing.website_url ?? ""} onChange={(e) => setEditing({ ...editing, website_url: e.target.value })} placeholder="https://www.exemple.tn" />
              </Field>
              <Field label={t("timezone")} htmlFor="edZone">
                <Select id="edZone" value={editing.timezone} onValueChange={(timezone) => setEditing({ ...editing, timezone })} options={Array.from(new Set([editing.timezone, ...TIMEZONES])).map((value) => ({ value, label: value }))} />
              </Field>
            </div>
          )}
          <DialogFooter>
            <Button loading={update.pending} disabled={!editing?.name.trim()} onClick={() => editing && update.run({ id: editing.id, name: editing.name, timezone: editing.timezone, websiteUrl: editing.website_url ?? "" })}>
              {t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
