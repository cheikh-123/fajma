import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import {
  ArrowLeft,
  FileText,
  Loader2,
  MessageSquare,
  Paperclip,
  Send,
  ShieldAlert,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { getThread, listThreads, sendChatMessage, type Thread } from "@/api/messages";
import { LanguageSwitcher, useI18n } from "@/lib/i18n";
import { ThemeToggle } from "@/lib/theme";
import { formatDateTime } from "@/lib/datetime";
import { FajmaMark } from "@/components/FajmaMark";

const threadsQO = queryOptions({
  queryKey: ["threads"],
  queryFn: () => listThreads(),
  refetchInterval: 60_000,
});

export const Route = createFileRoute("/_authenticated/messages")({
  validateSearch: (s) =>
    z
      .object({ doctor: z.string().uuid().optional(), patient: z.string().uuid().optional() })
      .parse(s),
  loader: ({ context }) => context.queryClient.ensureQueryData(threadsQO),
  head: () => ({
    meta: [
      { title: "Messagerie — Fajma" },
      { name: "description", content: "Échangez en toute confidentialité avec vos médecins." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MessagesPage,
});

function MessagesPage() {
  const { t } = useI18n();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { data: threads } = useSuspenseQuery(threadsQO);
  const active =
    threads.find(
      (th) =>
        th.doctor_id === search.doctor && (!search.patient || th.patient_id === search.patient),
    ) ?? null;

  function open(th: Thread) {
    navigate({ to: "/messages", search: { doctor: th.doctor_id, patient: th.patient_id } });
  }

  return (
    <div className="flex min-h-screen flex-col bg-sunu-surface">
      <header className="border-b border-sunu-line bg-sunu-card">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <FajmaMark className="size-8" />
            <span className="text-xl font-bold text-sunu-green">Fajma</span>
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <ThemeToggle />
            <LanguageSwitcher />
            <Link
              to="/mon-espace"
              className="flex items-center gap-1 text-sm font-semibold text-sunu-ink/60 hover:text-sunu-green"
            >
              <ArrowLeft className="size-4" />{" "}
              <span className="hidden sm:inline">{t("nav.mySpace")}</span>
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-sunu-dark">
          <MessageSquare className="size-6 text-sunu-green" /> {t("msg.title")}
        </h1>
        <p className="mt-2 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" /> {t("msg.warning")}
        </p>

        {threads.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-sunu-line bg-sunu-card p-10 text-center text-sm text-sunu-ink/60">
            {t("msg.empty")}
          </div>
        ) : (
          <div className="mt-6 grid gap-4 md:grid-cols-[300px_1fr]">
            <nav
              className={`${active ? "hidden md:block" : ""} self-start overflow-hidden rounded-2xl border border-sunu-line bg-sunu-card`}
            >
              {threads.map((th) => {
                const selected =
                  active?.doctor_id === th.doctor_id && active?.patient_id === th.patient_id;
                return (
                  <button
                    key={`${th.doctor_id}:${th.patient_id}`}
                    onClick={() => open(th)}
                    className={`flex w-full items-start gap-3 border-b border-sunu-line px-4 py-3 text-left last:border-0 ${selected ? "bg-sunu-green-soft/60" : "hover:bg-sunu-surface"}`}
                  >
                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-sunu-green-soft font-bold text-sunu-green">
                      {th.title.replace(/^Dr\.?\s*/i, "")[0] ?? "?"}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate font-semibold text-sunu-dark">{th.title}</span>
                        {th.unread > 0 && (
                          <span className="rounded-full bg-sunu-green px-1.5 text-[10px] font-bold text-white">
                            {th.unread}
                          </span>
                        )}
                      </span>
                      <span className="block truncate text-xs text-sunu-ink/55">
                        {th.last_body ?? th.subtitle}
                      </span>
                    </span>
                  </button>
                );
              })}
            </nav>

            <section
              className={`${active ? "" : "hidden md:flex"} flex min-h-[60vh] flex-col rounded-2xl border border-sunu-line bg-sunu-card`}
            >
              {active ? (
                <Conversation key={`${active.doctor_id}:${active.patient_id}`} thread={active} />
              ) : (
                <p className="m-auto p-10 text-sm text-sunu-ink/50">{t("msg.pick")}</p>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("Lecture du fichier impossible"));
    reader.readAsDataURL(file);
  });
}

function Conversation({ thread }: { thread: Thread }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const key = ["thread", thread.doctor_id, thread.patient_id];
  const { data, isLoading } = useQuery({
    queryKey: key,
    queryFn: () =>
      getThread({ data: { doctor_id: thread.doctor_id, patient_id: thread.patient_id } }),
    refetchInterval: 60_000, // secours : les nouveaux messages arrivent en temps réel (use-live-events)
  });
  const send = useMutation({
    mutationFn: async () =>
      sendChatMessage({
        data: {
          doctor_id: thread.doctor_id,
          patient_id: thread.patient_id,
          body,
          ...(file ? { file_name: file.name, content_base64: await toBase64(file) } : {}),
        },
      }),
    onSuccess: () => {
      setBody("");
      setFile(null);
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: ["threads"] });
    },
    onError: (e) => toast.error(e.message),
  });

  const count = data?.messages.length ?? 0;
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [count]);
  useEffect(() => {
    // La lecture du fil marque les messages comme lus : on rafraîchit les compteurs.
    if (data) qc.invalidateQueries({ queryKey: ["threads"] });
  }, [data, qc]);

  return (
    <>
      <div className="flex items-center gap-3 border-b border-sunu-line px-4 py-3">
        <Link
          to="/messages"
          className="text-sunu-ink/50 md:hidden"
          aria-label="Retour aux conversations"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div>
          <p className="font-bold text-sunu-dark">{data?.counterpart ?? thread.title}</p>
          <p className="text-xs text-sunu-ink/50">{thread.subtitle}</p>
        </div>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto px-4 py-4" style={{ maxHeight: "60vh" }}>
        {isLoading ? (
          <Loader2 className="mx-auto size-5 animate-spin text-sunu-green" />
        ) : count === 0 ? (
          <p className="py-10 text-center text-sm text-sunu-ink/50">{t("msg.noMessages")}</p>
        ) : (
          data?.messages.map((m) => {
            const mine = m.sender_id === data.me;
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${mine ? "rounded-br-sm bg-sunu-green text-white" : "rounded-bl-sm bg-sunu-surface text-sunu-dark"}`}
                >
                  {m.attachment &&
                    (m.attachment.mime.startsWith("image/") ? (
                      <a href={m.attachment.url} target="_blank" rel="noopener noreferrer">
                        <img
                          src={m.attachment.url}
                          alt={m.attachment.name}
                          loading="lazy"
                          className="mb-1 max-h-60 rounded-lg object-contain"
                        />
                      </a>
                    ) : (
                      <a
                        href={m.attachment.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`mb-1 flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-semibold ${mine ? "bg-white/15" : "bg-sunu-card"}`}
                      >
                        <FileText className="size-4 shrink-0" />
                        <span className="truncate">{m.attachment.name}</span>
                        <span className="shrink-0 opacity-70">
                          {Math.max(1, Math.round(m.attachment.size / 1024))} Ko
                        </span>
                      </a>
                    ))}
                  {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                  <p className={`mt-1 text-[10px] ${mine ? "text-white/70" : "text-sunu-ink/45"}`}>
                    {formatDateTime(m.created_at, {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottom} />
      </div>
      {file && (
        <div className="flex items-center gap-2 border-t border-sunu-line px-3 pt-2 text-xs text-sunu-ink/70">
          <Paperclip className="size-3.5" />
          <span className="truncate">{file.name}</span>
          <button
            type="button"
            onClick={() => setFile(null)}
            aria-label={t("msg.removeFile")}
            className="text-sunu-ink/50 hover:text-red-600"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (body.trim() || file) send.mutate();
        }}
        className="flex items-end gap-2 border-t border-sunu-line p-3"
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            e.target.value = "";
            if (f && f.size > 6_000_000) return toast.error(t("msg.fileTooBig"));
            setFile(f);
          }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          title={t("msg.attach")}
          aria-label={t("msg.attach")}
          className="grid size-10 shrink-0 place-items-center rounded-xl border border-sunu-line text-sunu-ink/60 hover:border-sunu-green hover:text-sunu-green"
        >
          <Paperclip className="size-4" />
        </button>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (body.trim() || file) send.mutate();
            }
          }}
          rows={2}
          maxLength={4000}
          placeholder={t("msg.placeholder")}
          aria-label={t("msg.placeholder")}
          className="min-w-0 flex-1 resize-none rounded-xl border border-sunu-line px-3 py-2 text-sm outline-none focus:border-sunu-green"
        />
        <button
          disabled={(!body.trim() && !file) || send.isPending}
          className="flex items-center gap-1.5 rounded-xl bg-sunu-green px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          <Send className="size-4" /> <span className="hidden sm:inline">{t("msg.send")}</span>
        </button>
      </form>
    </>
  );
}
