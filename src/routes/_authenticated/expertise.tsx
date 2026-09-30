import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { ArrowLeft, FileText, Loader2, Lock, Plus, Send, Stethoscope } from "lucide-react";
import { toast } from "sonner";
import {
  closeExpertise,
  createExpertise,
  getExpertise,
  listExpertise,
  listMyFollowedPatients,
  replyExpertise,
  searchExperts,
} from "@/api/expertise";
import { formatDateTime } from "@/lib/datetime";

export const Route = createFileRoute("/_authenticated/expertise")({
  validateSearch: (s) => z.object({ demande: z.string().optional() }).parse(s),
  head: () => ({
    meta: [{ title: "Télé-expertise — Fajma" }, { name: "robots", content: "noindex" }],
  }),
  component: ExpertisePage,
});

const when = (v: string) => formatDateTime(v, { dateStyle: "short", timeStyle: "short" });

function ExpertisePage() {
  const { demande } = Route.useSearch();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const { data: list, error } = useQuery({
    queryKey: ["expertise"],
    queryFn: listExpertise,
    refetchInterval: 30_000,
  });
  const open = (id?: string) => {
    setCreating(false);
    navigate({ to: "/expertise", search: id ? { demande: id } : {} });
  };

  return (
    <div className="min-h-screen bg-sunu-surface">
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <Link
          to="/pro"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-sunu-green"
        >
          <ArrowLeft className="size-4" /> Espace médecin
        </Link>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-sunu-dark">
              <Stethoscope className="size-6 text-sunu-green" /> Télé-expertise
            </h1>
            <p className="text-sm text-sunu-ink/60">
              Demandez l'avis d'un confrère, échangez entre professionnels.
            </p>
          </div>
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 rounded-xl bg-sunu-green px-4 py-2 text-sm font-semibold text-white"
          >
            <Plus className="size-4" /> Nouvelle demande d'avis
          </button>
        </div>
        {error && <p className="mt-6 text-sm text-red-600">Espace réservé aux médecins.</p>}
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr] [&>*]:min-w-0">
          <aside className="space-y-2" aria-label="Demandes d'avis">
            {(list ?? []).length === 0 && (
              <p className="rounded-xl bg-sunu-card p-5 text-sm text-sunu-ink/50">
                Aucun échange pour le moment.
              </p>
            )}
            {(list ?? []).map((r) => (
              <button
                key={r.id}
                onClick={() => open(r.id)}
                className={`w-full rounded-xl border bg-sunu-card p-3 text-left ${demande === r.id ? "border-sunu-green" : "border-sunu-line"}`}
              >
                <p className="flex items-center justify-between gap-2 text-sm font-semibold text-sunu-dark">
                  <span className="truncate">{r.subject}</span>
                  {r.awaiting_me && (
                    <span
                      className="size-2 shrink-0 rounded-full bg-sunu-green"
                      aria-label="À traiter"
                    />
                  )}
                </p>
                <p className="text-xs text-sunu-ink/55">
                  {r.role === "requester"
                    ? `À ${r.expert.full_name}`
                    : `De ${r.requester.full_name}`}{" "}
                  · {r.status_label}
                </p>
                {r.last_message && (
                  <p className="mt-1 truncate text-xs text-sunu-ink/45">{r.last_message}</p>
                )}
              </button>
            ))}
          </aside>
          <section className="rounded-2xl border border-sunu-line bg-sunu-card p-5">
            {creating ? (
              <NewRequest onCreated={(id) => open(id)} />
            ) : demande ? (
              <Thread id={demande} />
            ) : (
              <p className="py-16 text-center text-sm text-sunu-ink/50">
                Choisissez un échange ou créez une demande d'avis.
              </p>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

function Thread({ id }: { id: string }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["expertise", id],
    queryFn: () => getExpertise(id),
    refetchInterval: 15_000,
  });
  const [text, setText] = useState("");
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["expertise"] });
  };
  const send = useMutation({
    mutationFn: () => replyExpertise({ data: { id, body: text } }),
    onSuccess: () => {
      setText("");
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const close = useMutation({ mutationFn: () => closeExpertise(id), onSuccess: refresh });
  if (!data) return <Loader2 className="size-5 animate-spin text-sunu-ink/40" />;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-sunu-line pb-3">
        <div>
          <h2 className="font-bold text-sunu-dark">{data.subject}</h2>
          <p className="text-xs text-sunu-ink/55">
            {data.requester.full_name} → {data.expert.full_name}
            {data.expert.specialty && ` (${data.expert.specialty})`} · {data.status_label}
          </p>
        </div>
        {data.status !== "closed" && (
          <button
            onClick={() => close.mutate()}
            className="rounded-lg border border-sunu-line px-3 py-1.5 text-xs font-semibold text-sunu-ink/60"
          >
            Clôturer
          </button>
        )}
      </div>
      {data.patient && (
        <div className="mt-3 rounded-xl bg-sunu-surface p-3 text-sm">
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-sunu-ink/50">
            <Lock className="size-3.5" /> Dossier partagé — patient informé
          </p>
          <p className="mt-1 font-semibold text-sunu-dark">{data.patient.full_name}</p>
          <dl className="mt-1 grid gap-x-4 text-xs sm:grid-cols-2">
            {(
              [
                ["Groupe sanguin", data.patient.health_profile.blood_group],
                ["Allergies", data.patient.health_profile.allergies],
                ["Antécédents", data.patient.health_profile.conditions],
                ["Traitements", data.patient.health_profile.treatments],
              ] as const
            ).map(([k, v]) => (
              <div key={k}>
                <dt className="inline text-sunu-ink/50">{k} : </dt>
                <dd className="inline text-sunu-dark">{v || "—"}</dd>
              </div>
            ))}
          </dl>
          {(data.documents ?? []).length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-2">
              {data.documents!.map((d) => (
                <li key={d.id}>
                  <a
                    href={d.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-lg border border-sunu-line bg-sunu-card px-2.5 py-1 text-xs font-semibold text-sunu-green"
                  >
                    <FileText className="size-3.5" /> {d.title}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <ol className="mt-4 space-y-3">
        {data.messages.map((m) => (
          <li
            key={m.id}
            className={`max-w-[85%] rounded-xl px-4 py-2.5 text-sm ${m.mine ? "ml-auto bg-sunu-green text-white" : "bg-sunu-surface text-sunu-dark"}`}
          >
            <p
              className={`text-[11px] font-semibold ${m.mine ? "text-white/70" : "text-sunu-ink/50"}`}
            >
              {m.author} · {when(m.created_at)}
            </p>
            <p className="mt-0.5 whitespace-pre-wrap">{m.body}</p>
          </li>
        ))}
      </ol>
      {data.status !== "closed" && (
        <form
          className="mt-4 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send.mutate();
          }}
        >
          <textarea
            aria-label="Votre message"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            maxLength={5000}
            className="min-w-0 flex-1 rounded-lg border border-sunu-line px-3 py-2 text-sm"
          />
          <button
            disabled={!text.trim() || send.isPending}
            aria-label="Envoyer"
            className="rounded-lg bg-sunu-green px-4 text-white disabled:opacity-50"
          >
            <Send className="size-4" />
          </button>
        </form>
      )}
    </div>
  );
}

function NewRequest({ onCreated }: { onCreated: (id: string) => void }) {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [expertId, setExpertId] = useState("");
  const [subject, setSubject] = useState("");
  const [question, setQuestion] = useState("");
  const [patientId, setPatientId] = useState("");
  const [informed, setInformed] = useState(false);
  const [docs, setDocs] = useState<string[]>([]);
  const { data: experts } = useQuery({ queryKey: ["experts", q], queryFn: () => searchExperts(q) });
  const { data: patients } = useQuery({
    queryKey: ["followed-patients"],
    queryFn: listMyFollowedPatients,
  });
  const patient = patients?.find((p) => p.id === patientId);
  const create = useMutation({
    mutationFn: () =>
      createExpertise({
        data: {
          expert_id: expertId,
          subject,
          question,
          patient_id: patientId || undefined,
          patient_informed: patientId ? informed : undefined,
          document_ids: patientId ? docs : undefined,
        },
      }),
    onSuccess: (r) => {
      toast.success("Demande d'avis envoyée");
      qc.invalidateQueries({ queryKey: ["expertise"] });
      onCreated(r.id);
    },
    onError: (e) => toast.error(e.message),
  });
  const field = "w-full rounded-lg border border-sunu-line px-3 py-2 text-sm";

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate();
      }}
    >
      <h2 className="font-bold text-sunu-dark">Nouvelle demande d'avis</h2>
      <div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Chercher un confrère (nom, spécialité, ville)"
          aria-label="Chercher un confrère"
          className={field}
        />
        <select
          required
          aria-label="Confrère"
          value={expertId}
          onChange={(e) => setExpertId(e.target.value)}
          className={`${field} mt-2`}
        >
          <option value="">Choisir le confrère…</option>
          {(experts ?? []).map((d) => (
            <option key={d.id} value={d.id}>
              {d.full_name} — {d.specialty ?? "Médecin"}, {d.city}
            </option>
          ))}
        </select>
      </div>
      <input
        required
        minLength={3}
        maxLength={160}
        aria-label="Objet"
        placeholder="Objet (ex. avis sur ECG)"
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        className={field}
      />
      <textarea
        required
        minLength={10}
        rows={5}
        aria-label="Question"
        placeholder="Contexte clinique et question posée"
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        className={field}
      />
      <select
        aria-label="Patient concerné"
        value={patientId}
        onChange={(e) => {
          setPatientId(e.target.value);
          setDocs([]);
          setInformed(false);
        }}
        className={field}
      >
        <option value="">Aucun patient (question générale ou cas anonymisé)</option>
        {(patients ?? []).map((p) => (
          <option key={p.id} value={p.id}>
            {p.full_name}
          </option>
        ))}
      </select>
      {patient && (
        <div className="space-y-2 rounded-lg bg-sunu-surface p-3 text-sm">
          {patient.documents.length > 0 ? (
            <fieldset>
              <legend className="text-xs font-semibold text-sunu-ink/60">
                Documents partagés par le patient à joindre
              </legend>
              {patient.documents.map((d) => (
                <label key={d.id} className="mt-1 flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={docs.includes(d.id)}
                    onChange={(e) =>
                      setDocs(e.target.checked ? [...docs, d.id] : docs.filter((x) => x !== d.id))
                    }
                  />
                  {d.title}
                </label>
              ))}
            </fieldset>
          ) : (
            <p className="text-xs text-sunu-ink/55">Ce patient ne vous a partagé aucun document.</p>
          )}
          <label className="flex items-start gap-2 text-xs font-semibold text-sunu-dark">
            <input
              type="checkbox"
              required
              checked={informed}
              onChange={(e) => setInformed(e.target.checked)}
              className="mt-0.5"
            />
            J'ai informé le patient de cette demande d'avis et il ne s'y est pas opposé. Le confrère
            verra son profil de santé et les documents joints ; cet accès apparaîtra dans le journal
            du patient.
          </label>
        </div>
      )}
      <button
        disabled={create.isPending || !expertId}
        className="flex items-center gap-1.5 rounded-lg bg-sunu-green px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {create.isPending && <Loader2 className="size-4 animate-spin" />} Envoyer la demande
      </button>
    </form>
  );
}
