"use client";

import { AlertCircle, BookOpen, CheckCircle2, FileText, Globe, HelpCircle, Loader2, Plus, RotateCcw, Search, Trash2, Upload } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { RealtimeRefresh } from "@/components/common/realtime-refresh";
import { useAction } from "@/components/common/use-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/menu";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { useRouter } from "@/i18n/navigation";
import { KNOWLEDGE_MIME_TYPES, MAX_UPLOAD_BYTES } from "@/lib/domain";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/client";
import { safeFileName } from "@/lib/utils";
import { addTextDocument, addUrlDocument, deleteDocument, registerUpload, retryDocument, testKnowledgeSearch } from "./actions";

type Doc = Database["public"]["Tables"]["knowledge_documents"]["Row"];

const SOURCE_ICON = { file: FileText, url: Globe, text: FileText, faq: HelpCircle } as const;

function AddDocumentDialog({ orgId, brandId }: { orgId: string; brandId: string }) {
  const t = useTranslations("knowledge");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [tab, setTab] = useState("file");
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const done = () => {
    setOpen(false);
    setTitle("");
    setText("");
    setUrl("");
    toast.success(t("added"));
    router.refresh();
  };
  const addText = useAction(addTextDocument, { onSuccess: done });
  const addUrl = useAction(addUrlDocument, { onSuccess: done });
  const register = useAction(registerUpload, { onSuccess: done });

  const onFile = async (file: File) => {
    const mime = file.type || (file.name.endsWith(".md") ? "text/markdown" : file.name.endsWith(".csv") ? "text/csv" : "");
    if (!KNOWLEDGE_MIME_TYPES.includes(mime)) {
      toast.error(t("file_type"));
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error(t("file_size"));
      return;
    }
    setUploading(true);
    const path = `${orgId}/${brandId}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
    const { error } = await createClient().storage.from("knowledge").upload(path, file, { contentType: mime });
    setUploading(false);
    if (error) {
      toast.error(t("upload_failed"));
      return;
    }
    await register.run({ title: file.name.slice(0, 200), path, mime, size: file.size });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus />
          {t("add")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("add_title")}</DialogTitle>
          <DialogDescription>{t("add_text")}</DialogDescription>
        </DialogHeader>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="file">{t("tab_file")}</TabsTrigger>
            <TabsTrigger value="text">{t("tab_text")}</TabsTrigger>
            <TabsTrigger value="faq">{t("tab_faq")}</TabsTrigger>
            <TabsTrigger value="url">{t("tab_url")}</TabsTrigger>
          </TabsList>

          <TabsContent value="file">
            <input ref={fileInput} type="file" hidden accept=".pdf,.docx,.txt,.csv,.md" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0]);
              }}
              className="bg-dots flex w-full flex-col items-center rounded-xl border border-dashed px-6 py-10 text-center transition-colors hover:border-primary/50"
            >
              {uploading || register.pending ? <Loader2 className="mb-2 size-5 animate-spin text-primary" /> : <Upload className="mb-2 size-5 text-primary" />}
              <span className="text-[13px] font-medium">{t("drop")}</span>
              <span className="mt-1 text-xs text-muted-foreground">{t("drop_hint")}</span>
            </button>
          </TabsContent>

          <TabsContent value="text" className="space-y-3">
            <Field label={t("doc_title")} htmlFor="kbTitle">
              <Input id="kbTitle" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("doc_title_placeholder")} maxLength={200} />
            </Field>
            <Field label={t("content")} htmlFor="kbText">
              <Textarea id="kbText" value={text} onChange={(e) => setText(e.target.value)} className="min-h-40" placeholder={t("content_placeholder")} />
            </Field>
          </TabsContent>

          <TabsContent value="faq" className="space-y-3">
            <Field label={t("doc_title")} htmlFor="faqTitle">
              <Input id="faqTitle" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("faq_title_placeholder")} maxLength={200} />
            </Field>
            <Field label={t("faq_content")} htmlFor="faqText" hint={t("faq_hint")}>
              <Textarea id="faqText" value={text} onChange={(e) => setText(e.target.value)} className="min-h-40" placeholder={t("faq_placeholder")} />
            </Field>
          </TabsContent>

          <TabsContent value="url">
            <Field label={t("url")} htmlFor="kbUrl" hint={t("url_hint")}>
              <Input id="kbUrl" dir="ltr" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.exemple.tn/menu" />
            </Field>
          </TabsContent>
        </Tabs>

        {tab !== "file" && (
          <DialogFooter>
            {tab === "url" ? (
              <Button loading={addUrl.pending} onClick={() => addUrl.run({ url: /^https?:\/\//.test(url) ? url : `https://${url}` })}>
                {t("add_submit")}
              </Button>
            ) : (
              <Button loading={addText.pending} onClick={() => addText.run({ title, text, kind: tab as "text" | "faq" })}>
                {t("add_submit")}
              </Button>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SearchPanel() {
  const t = useTranslations("knowledge");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Awaited<ReturnType<typeof testKnowledgeSearch>> | null>(null);
  const search = useAction(testKnowledgeSearch, { onSuccess: () => undefined });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("search_title")}</CardTitle>
        <CardDescription>{t("search_text")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (query.trim().length >= 2) setResults(await search.run({ query }));
          }}
        >
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("search_placeholder")} aria-label={t("search_title")} />
          <Button type="submit" variant="secondary" size="icon" loading={search.pending} aria-label={t("search_title")}>
            {!search.pending && <Search />}
          </Button>
        </form>
        {results?.ok && (
          <ul className="mt-4 space-y-2">
            {results.data.length === 0 && <li className="text-[13px] text-muted-foreground">{t("search_empty")}</li>}
            {results.data.map((match) => (
              <li key={match.chunk_id} className="animate-rise rounded-lg bg-secondary p-3">
                <div className="mb-1 text-[11px] font-semibold text-muted-foreground">{match.document_title}</div>
                <p className="line-clamp-4 text-[13px] leading-relaxed whitespace-pre-line">{match.content}</p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function KnowledgeView({ docs, orgId, brandId, canEdit, localIndex }: { docs: Doc[]; orgId: string; brandId: string; canEdit: boolean; localIndex: boolean }) {
  const t = useTranslations("knowledge");
  const format = useFormatter();
  const router = useRouter();
  const remove = useAction(deleteDocument, { onSuccess: () => router.refresh() });
  const retry = useAction(retryDocument, { onSuccess: () => router.refresh() });

  return (
    <>
      <RealtimeRefresh table="knowledge_documents" filter={`brand_id=eq.${brandId}`} />
      <PageHeader title={t("title")} description={t("subtitle")} actions={canEdit && <AddDocumentDialog orgId={orgId} brandId={brandId} />} />

      {localIndex && <p className="mb-5 rounded-lg bg-warm-soft px-3 py-2.5 text-[13px] text-warm">{t("local_index_notice")}</p>}

      <div className="grid gap-5 lg:grid-cols-[1fr_340px] lg:items-start">
        {docs.length === 0 ? (
          <EmptyState icon={BookOpen} title={t("empty_title")} description={t("empty_text")} />
        ) : (
          <Card>
            <ul className="divide-y">
              {docs.map((doc) => {
                const Icon = SOURCE_ICON[doc.source_type as keyof typeof SOURCE_ICON] ?? FileText;
                return (
                  <li key={doc.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
                      <Icon className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium">{doc.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {t(`source_${doc.source_type}`)} · {format.dateTime(new Date(doc.created_at), { dateStyle: "medium" })}
                        {doc.status === "ready" && ` · ${t("chunks", { count: doc.chunk_count })}`}
                      </div>
                    </div>
                    {doc.status === "ready" && (
                      <Badge variant="success">
                        <CheckCircle2 />
                        {t("status_ready")}
                      </Badge>
                    )}
                    {(doc.status === "pending" || doc.status === "processing") && (
                      <Badge variant="primary">
                        <Loader2 className="animate-spin" />
                        {t("status_processing")}
                      </Badge>
                    )}
                    {doc.status === "failed" && (
                      <Badge variant="danger">
                        <AlertCircle />
                        {t("status_failed")}
                      </Badge>
                    )}
                    {canEdit && (
                      <div className="flex shrink-0 items-center">
                        {doc.status === "failed" && (
                          <Button variant="ghost" size="icon-sm" aria-label={t("retry")} onClick={() => retry.run({ id: doc.id })}>
                            <RotateCcw />
                          </Button>
                        )}
                        <ConfirmDialog
                          trigger={
                            <Button variant="ghost" size="icon-sm" aria-label={t("delete")}>
                              <Trash2 />
                            </Button>
                          }
                          title={t("delete_title")}
                          description={t("delete_text", { title: doc.title })}
                          confirmLabel={t("delete")}
                          loading={remove.pending}
                          onConfirm={() => remove.run({ id: doc.id })}
                        />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
        <SearchPanel />
      </div>
    </>
  );
}
