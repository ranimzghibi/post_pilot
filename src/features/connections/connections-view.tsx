"use client";

import { CheckCircle2, FlaskConical, Info, RefreshCw, Send, Share2, Unplug } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { NetworkIcon } from "@/components/common/network-icon";
import { useAction } from "@/components/common/use-action";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/input";
import { Select, Switch } from "@/components/ui/menu";
import { Avatar, EmptyState, PageHeader } from "@/components/ui/misc";
import { useRouter } from "@/i18n/navigation";
import { NETWORKS, NETWORK_LIST } from "@/lib/domain";
import type { Database } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";
import { cancelOAuthSession, connectSandbox, connectSelected, disconnectAccount, publishTest, refreshAccount, setAccountTestFlag } from "./actions";

type Account = Database["public"]["Tables"]["social_accounts"]["Row"];
type Job = Pick<Database["public"]["Tables"]["publication_jobs"]["Row"], "id" | "status" | "caption" | "created_at" | "external_url" | "last_error"> & { account?: { display_name: string; network: string } | null };
type Candidate = { key: string; network: string; displayName: string; username: string | null; avatarUrl: string | null };
export type LibraryAsset = { id: string; url: string; alt: string };

const STATUS_VARIANT: Record<Account["status"], BadgeVariant> = { active: "success", expiring: "warning", expired: "danger", error: "danger" };

type PublishProps = {
  accounts: Account[];
  assets: LibraryAsset[];
  onOpenChange: (open: boolean) => void;
  initialCaption?: string;
  initialAssetId?: string | null;
  variantId?: string | null;
  onPublished?: () => void;
};

/** Monté à chaque ouverture : l'état repart de zéro et la clé d'idempotence est neuve. */
function PublishForm({ accounts, assets, onOpenChange, initialCaption = "", initialAssetId = null, variantId = null, onPublished }: PublishProps) {
  const t = useTranslations("connections");
  const router = useRouter();
  const eligible = useMemo(() => accounts.filter((a) => a.is_test), [accounts]);
  const [accountId, setAccountId] = useState("");
  const [caption, setCaption] = useState(initialCaption);
  const [assetId, setAssetId] = useState<string | null>(initialAssetId);
  const [key] = useState(() => crypto.randomUUID());
  const selected = eligible.find((a) => a.id === (accountId || eligible[0]?.id));

  const publish = useAction(publishTest, {
    onSuccess: (job) => {
      if (onPublished) onPublished();
      else toast.success(job.url ? t("published_link") : t("published"));
      onOpenChange(false);
      router.refresh();
    },
  });

  return (
    <>
      <div className="space-y-4">
        <Field label={t("publish_account")} htmlFor="publishAccount">
          <Select id="publishAccount" value={selected?.id} onValueChange={setAccountId} options={eligible.map((a) => ({ value: a.id, label: `${NETWORKS[a.network as keyof typeof NETWORKS]?.label ?? a.network} · ${a.display_name}` }))} />
        </Field>
        <Field label={t("publish_caption")} htmlFor="publishCaption">
          <Textarea id="publishCaption" dir="auto" value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={2200} />
        </Field>
        <Field label={t("publish_image")} hint={assets.length ? undefined : t("publish_no_images")}>
          {assets.length > 0 && (
            <div className="scrollbar-thin grid max-h-44 grid-cols-4 gap-2 overflow-y-auto sm:grid-cols-6">
              {assets.map((asset) => (
                <button key={asset.id} type="button" aria-pressed={assetId === asset.id} aria-label={asset.alt || t("publish_image")} onClick={() => setAssetId(assetId === asset.id ? null : asset.id)} className={cn("aspect-square overflow-hidden rounded-lg border-2 transition-colors", assetId === asset.id ? "border-primary" : "border-transparent")}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- URL signée à durée limitée */}
                  <img src={asset.url} alt="" className="size-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </Field>
      </div>
      <DialogFooter>
        <Button
          loading={publish.pending}
          disabled={!selected || (selected.network === "instagram" && !assetId) || (!caption.trim() && !assetId)}
          onClick={() => selected && publish.run({ accountId: selected.id, caption, assetIds: assetId ? [assetId] : [], idempotencyKey: key, variantId })}
        >
          {!publish.pending && <Send />}
          {t("publish_submit")}
        </Button>
      </DialogFooter>
    </>
  );
}

export function PublishDialog({ open, ...props }: PublishProps & { open: boolean }) {
  const t = useTranslations("connections");
  return (
    <Dialog open={open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("publish_title")}</DialogTitle>
          <DialogDescription>{t("publish_text")}</DialogDescription>
        </DialogHeader>
        <PublishForm {...props} />
      </DialogContent>
    </Dialog>
  );
}

function SessionPicker({ sessionId, candidates }: { sessionId: string; candidates: Candidate[] }) {
  const t = useTranslations("connections");
  const router = useRouter();
  const [keys, setKeys] = useState<string[]>([]);
  const [isTest, setIsTest] = useState(true);
  const close = () => router.replace("/app/connections");
  const connect = useAction(connectSelected, { success: t("connected"), onSuccess: close });
  const cancel = useAction(cancelOAuthSession, { onSuccess: close });

  return (
    <Dialog open onOpenChange={(open) => !open && cancel.run({ sessionId })}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("pick_title")}</DialogTitle>
          <DialogDescription>{t("pick_text")}</DialogDescription>
        </DialogHeader>
        <ul className="space-y-1.5">
          {candidates.map((candidate) => {
            const active = keys.includes(candidate.key);
            return (
              <li key={candidate.key}>
                <button type="button" aria-pressed={active} onClick={() => setKeys(active ? keys.filter((k) => k !== candidate.key) : [...keys, candidate.key])} className={cn("flex w-full items-center gap-3 rounded-xl border p-2.5 text-start transition-colors", active ? "border-primary bg-accent" : "hover:bg-secondary")}>
                  <Avatar name={candidate.displayName} src={candidate.avatarUrl} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium">{candidate.displayName}</span>
                    {candidate.username && (
                      <span className="block text-xs text-muted-foreground" dir="ltr">
                        @{candidate.username}
                      </span>
                    )}
                  </span>
                  <NetworkIcon network={candidate.network} />
                </button>
              </li>
            );
          })}
        </ul>
        <label className="mt-4 flex items-center justify-between gap-3 text-[13px]">
          {t("mark_test")}
          <Switch checked={isTest} onCheckedChange={setIsTest} />
        </label>
        <DialogFooter>
          <Button loading={connect.pending} disabled={!keys.length} onClick={() => connect.run({ sessionId, keys, isTest })}>
            {t("connect_selected", { count: keys.length })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ConnectionsView({
  accounts,
  jobs,
  assets,
  sandbox,
  canConnect,
  canPublish,
  session,
  error,
}: {
  accounts: Account[];
  jobs: Job[];
  assets: LibraryAsset[];
  sandbox: boolean;
  canConnect: boolean;
  canPublish: boolean;
  session: { id: string; candidates: Candidate[] } | null;
  error: string | null;
}) {
  const t = useTranslations("connections");
  const tErrors = useTranslations("errors");
  const format = useFormatter();
  const router = useRouter();
  const refresh = () => router.refresh();
  const [publishOpen, setPublishOpen] = useState(false);

  const addSandbox = useAction(connectSandbox, { success: t("connected"), onSuccess: refresh });
  const disconnect = useAction(disconnectAccount, { success: t("disconnected"), onSuccess: refresh });
  const renew = useAction(refreshAccount, { success: t("checked"), onSuccess: refresh });
  const toggleTest = useAction(setAccountTestFlag, { onSuccess: refresh });

  useEffect(() => {
    if (error) toast.error(tErrors.has(error) ? tErrors(error) : tErrors("unexpected"));
  }, [error, tErrors]);

  const connect = (network: string) => {
    if (sandbox) addSandbox.run({ network: network as "facebook" | "instagram" });
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- route API de redirection OAuth, pas une page
    else window.location.assign("/api/oauth/meta/start");
  };

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={
          canPublish &&
          accounts.some((a) => a.is_test) && (
            <Button onClick={() => setPublishOpen(true)}>
              <Send />
              {t("publish_cta")}
            </Button>
          )
        }
      />

      {sandbox && (
        <div className="mb-5 flex items-start gap-2.5 rounded-xl bg-warm-soft p-3.5 text-[13px] text-warm">
          <FlaskConical className="mt-0.5 size-4 shrink-0" />
          <p>{t("sandbox_notice")}</p>
        </div>
      )}

      <div className="mb-6 grid gap-4 md:grid-cols-2">
        {NETWORK_LIST.map((network) => (
          <Card key={network}>
            <CardHeader className="flex-row items-center gap-3">
              <NetworkIcon network={network} className="size-9 rounded-xl" />
              <div className="min-w-0 flex-1">
                <CardTitle>{NETWORKS[network].label}</CardTitle>
                <CardDescription>{t(`hint_${network}`)}</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {canConnect && (
                <Button variant="secondary" size="sm" loading={addSandbox.pending} onClick={() => connect(network)}>
                  {t("connect")}
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <h2 className="mb-3 text-[15px] font-semibold tracking-tight">{t("accounts")}</h2>
      {accounts.length === 0 ? (
        <EmptyState icon={Share2} title={t("empty_title")} description={t("empty_text")} />
      ) : (
        <Card>
          <ul className="divide-y">
            {accounts.map((account) => (
              <li key={account.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="relative">
                  <Avatar name={account.display_name} src={account.avatar_url} />
                  <NetworkIcon network={account.network} className="absolute -end-1 -bottom-1 size-4 rounded" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-[13px] font-medium">{account.display_name}</span>
                    <Badge variant={STATUS_VARIANT[account.status]}>{t(`status_${account.status}`)}</Badge>
                    {account.is_sandbox && <Badge variant="warm">{t("sandbox")}</Badge>}
                    {account.is_test && !account.is_sandbox && <Badge variant="outline">{t("test")}</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {account.token_expires_at ? t("expires", { date: format.dateTime(new Date(account.token_expires_at), { dateStyle: "medium" }) }) : t("no_expiry")}
                  </div>
                </div>
                {canConnect && (
                  <div className="flex items-center gap-1">
                    {!account.is_sandbox && <Switch checked={account.is_test} aria-label={t("mark_test")} onCheckedChange={(is_test) => toggleTest.run({ id: account.id, is_test })} />}
                    <Button variant="ghost" size="sm" loading={renew.pending} onClick={() => renew.run({ id: account.id })}>
                      {!renew.pending && <RefreshCw />}
                      {t("renew")}
                    </Button>
                    <ConfirmDialog
                      trigger={
                        <Button variant="ghost" size="sm" className="text-destructive">
                          <Unplug />
                          {t("disconnect")}
                        </Button>
                      }
                      title={t("disconnect_title", { name: account.display_name })}
                      description={t("disconnect_text")}
                      confirmLabel={t("disconnect")}
                      loading={disconnect.pending}
                      onConfirm={() => disconnect.run({ id: account.id })}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {jobs.length > 0 && (
        <>
          <h2 className="mt-7 mb-3 text-[15px] font-semibold tracking-tight">{t("history")}</h2>
          <Card>
            <ul className="divide-y">
              {jobs.map((job) => (
                <li key={job.id} className="flex items-center gap-3 px-4 py-3">
                  {job.account && <NetworkIcon network={job.account.network} />}
                  <span className="min-w-0 flex-1 truncate text-[13px]">{job.caption || t("image_only")}</span>
                  <span className="hidden text-xs text-muted-foreground sm:block">{format.dateTime(new Date(job.created_at), { dateStyle: "short", timeStyle: "short" })}</span>
                  {job.status === "succeeded" ? (
                    <Badge variant="success">
                      <CheckCircle2 />
                      {t("job_succeeded")}
                    </Badge>
                  ) : job.status === "failed" ? (
                    <Badge variant="danger">
                      <Info />
                      {t("job_failed")}
                    </Badge>
                  ) : (
                    <Badge variant="primary">{t("job_running")}</Badge>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}

      <PublishDialog accounts={accounts} assets={assets} open={publishOpen} onOpenChange={setPublishOpen} />
      {session && <SessionPicker sessionId={session.id} candidates={session.candidates} />}
    </>
  );
}
