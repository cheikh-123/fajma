/** Espace médecin : proposer l'avis écrit (prix, délai) et répondre aux demandes, ordonnance comprise. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Clock, Loader2, MessageSquareText, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  answerAsyncRequest,
  getMyAsyncOffer,
  listProAsyncRequests,
  saveMyAsyncOffer,
  type AsyncRequest,
} from "@/api/econsult";
import { formatDateTime } from "@/lib/datetime";

export function AsyncPanel() {
  const qc = useQueryClient();
  const { data: offer } = useQuery({ queryKey: ["my-async-offer"], queryFn: getMyAsyncOffer });
  const { data: rows } = useQuery({
    queryKey: ["pro-async"],
    queryFn: listProAsyncRequests,
    refetchInterval: 60_000,
  });
  const [form, setForm] = useState({
    enabled: false,
    price: 5000,
    response_hours: 24,
    instructions: "",
  });
  useEffect(() => {
    if (offer) setForm({ ...offer, instructions: offer.instructions ?? "" });
  }, [offer]);
  const save = useMutation({
    mutationFn: () => saveMyAsyncOffer(form),
    onSuccess: () => {
      toast.success("Offre enregistrée");
      qc.invalidateQueries({ queryKey: ["my-async-offer"] });
    },
    onError: (e) => toast.error(e.message),
  });
  const todo = (rows ?? []).filter((r) => r.status === "submitted");
  const done = (rows ?? []).filter((r) => r.status !== "submitted").slice(0, 10);
  const field = "w-full rounded-lg border border-sunu-line bg-sunu-card px-3 py-2 text-sm";

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
      <section className="space-y-4">
        <h2 className="flex items-center gap-2 font-bold text-sunu-dark">
          <MessageSquareText className="size-5 text-sunu-green" /> Demandes à traiter ({todo.length}
          )
        </h2>
        {todo.length === 0 && (
          <p className="rounded-xl border border-dashed border-sunu-line bg-sunu-card p-8 text-center text-sm text-sunu-ink/55">
            Aucune demande en attente.
          </p>
        )}
        {todo.map((r) => (
          <RequestCard key={r.id} r={r} />
        ))}
        {done.length > 0 && (
          <>
            <h3 className="pt-2 text-sm font-bold text-sunu-ink/60">Traitées récemment</h3>
            <ul className="divide-y divide-sunu-line rounded-xl border border-sunu-line bg-sunu-card text-sm">
              {done.map((r) => (
                <li key={r.id} className="px-4 py-2.5">
                  <b>{r.patient?.full_name}</b> · {r.reason} · {r.status_label}
                  {r.outcome_label ? ` (${r.outcome_label})` : ""}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
        className="grid gap-2 self-start rounded-2xl border border-sunu-line bg-sunu-card p-5 text-sm"
      >
        <h2 className="font-bold text-sunu-dark">Mon offre d'avis écrit</h2>
        <p className="text-xs text-sunu-ink/55">
          Le patient décrit ses symptômes avec photos et paie d'avance ; vous répondez par écrit
          dans le délai choisi. Sans réponse à temps, il est remboursé.
        </p>
        <label className="flex items-center gap-2 font-semibold">
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
          />
          Proposer l'avis écrit sur ma fiche
        </label>
        <label className="grid gap-1 text-xs font-semibold text-sunu-ink/60">
          Prix (F CFA)
          <input
            type="number"
            min={0}
            value={form.price}
            onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
            className={field}
          />
        </label>
        <label className="grid gap-1 text-xs font-semibold text-sunu-ink/60">
          Délai de réponse
          <select
            value={form.response_hours}
            onChange={(e) => setForm({ ...form, response_hours: Number(e.target.value) })}
            className={field}
          >
            <option value={24}>24 heures</option>
            <option value={48}>48 heures</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs font-semibold text-sunu-ink/60">
          Consignes aux patients (facultatif)
          <textarea
            rows={2}
            maxLength={400}
            value={form.instructions}
            onChange={(e) => setForm({ ...form, instructions: e.target.value })}
            placeholder="Photos nettes, à la lumière du jour…"
            className={field}
          />
        </label>
        <button className="rounded-lg bg-sunu-green px-4 py-2 font-semibold text-white">
          Enregistrer
        </button>
      </form>
    </div>
  );
}

function RequestCard({ r }: { r: AsyncRequest }) {
  const qc = useQueryClient();
  const [answer, setAnswer] = useState("");
  const [outcome, setOutcome] = useState<NonNullable<AsyncRequest["outcome"]>>("advice");
  const [items, setItems] = useState<{ name: string; posology: string; duration: string }[]>([]);
  const send = useMutation({
    mutationFn: () =>
      answerAsyncRequest(r.id, {
        answer,
        outcome: items.length ? "prescription" : outcome,
        items: items.filter((i) => i.name.trim()),
      }),
    onSuccess: () => {
      toast.success("Réponse envoyée au patient");
      qc.invalidateQueries({ queryKey: ["pro-async"] });
    },
    onError: (e) => toast.error(e.message),
  });
  const field = "w-full rounded-lg border border-sunu-line bg-sunu-card px-3 py-2 text-sm";
  return (
    <article className="rounded-2xl border border-sunu-line bg-sunu-card p-5 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-bold text-sunu-dark">
            {r.patient?.full_name} · {r.reason}
          </p>
          <p className="text-xs text-sunu-ink/55">
            {r.patient?.birth_date ? `Né(e) le ${r.patient.birth_date} · ` : ""}
            {r.patient?.sex === "F" ? "Femme" : r.patient?.sex === "M" ? "Homme" : ""}
          </p>
        </div>
        {r.deadline_at && (
          <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
            <Clock className="size-3.5" /> avant le{" "}
            {formatDateTime(r.deadline_at, { dateStyle: "short", timeStyle: "short" })}
          </span>
        )}
      </div>
      <p className="mt-3 whitespace-pre-line">{r.symptoms}</p>
      <p className="mt-1 text-xs text-sunu-ink/60">
        {[
          r.since && `Depuis : ${r.since}`,
          r.temperature && `T° ${r.temperature} °C`,
          r.systolic && `TA ${r.systolic}/${r.diastolic ?? "?"}`,
          r.weight && `${r.weight} kg`,
          r.current_treatments && `Traitements : ${r.current_treatments}`,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
      {r.photos.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {r.photos.map((p) => (
            <a key={p.id} href={p.url} target="_blank" rel="noreferrer">
              <img
                src={p.url}
                alt="Photo du patient"
                className="size-24 rounded-lg object-cover ring-1 ring-sunu-line"
              />
            </a>
          ))}
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send.mutate();
        }}
        className="mt-4 grid gap-2 border-t border-sunu-line pt-3"
      >
        <textarea
          required
          minLength={10}
          rows={4}
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="Votre réponse au patient"
          aria-label="Réponse"
          className={field}
        />
        <select
          value={items.length ? "prescription" : outcome}
          onChange={(e) => setOutcome(e.target.value as typeof outcome)}
          disabled={items.length > 0}
          aria-label="Conclusion"
          className={field}
        >
          <option value="advice">Conseils</option>
          <option value="prescription">Ordonnance</option>
          <option value="in_person">Consultation en personne conseillée</option>
          <option value="emergency">Urgence : consulter immédiatement</option>
        </select>
        {items.map((it, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_100px_auto] gap-1.5">
            {(["name", "posology", "duration"] as const).map((k) => (
              <input
                key={k}
                value={it[k]}
                onChange={(e) =>
                  setItems(items.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)))
                }
                placeholder={k === "name" ? "Médicament" : k === "posology" ? "Posologie" : "Durée"}
                className={field}
              />
            ))}
            <button
              type="button"
              onClick={() => setItems(items.filter((_, j) => j !== i))}
              aria-label="Retirer"
              className="text-sunu-ink/40 hover:text-red-600"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setItems([...items, { name: "", posology: "", duration: "" }])}
          className="flex w-fit items-center gap-1 text-xs font-semibold text-sunu-green"
        >
          <Plus className="size-3.5" /> Ajouter un médicament (ordonnance)
        </button>
        <button
          disabled={send.isPending}
          className="flex items-center justify-center gap-1.5 rounded-lg bg-sunu-green px-4 py-2 font-semibold text-white disabled:opacity-50"
        >
          {send.isPending && <Loader2 className="size-4 animate-spin" />} Envoyer la réponse
        </button>
      </form>
    </article>
  );
}
