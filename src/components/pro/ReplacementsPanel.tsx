/**
 * Remplacements : le titulaire propose une période à un confrère inscrit, qui accepte ou refuse.
 * Pendant la période, l'agenda reste ouvert et le remplaçant reçoit les patients à son nom.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Check, Loader2, UserRoundCheck, X } from "lucide-react";
import { toast } from "sonner";
import { listClinicCandidates } from "@/api/clinic";
import {
  cancelReplacement,
  listMyReplacements,
  proposeReplacement,
  respondReplacement,
} from "@/api/doctor";
import type { Replacement } from "@/api/types";
import { formatDate } from "@/lib/datetime";

const STATUS: Record<Replacement["status"], { label: string; cls: string }> = {
  pending: { label: "En attente de réponse", cls: "bg-amber-50 text-amber-800" },
  accepted: { label: "Accepté", cls: "bg-sunu-teal/15 text-sunu-teal" },
  declined: { label: "Refusé", cls: "bg-sunu-surface text-sunu-ink/60" },
  cancelled: { label: "Annulé", cls: "bg-sunu-surface text-sunu-ink/60" },
};

const day = (d: string) => formatDate(`${d}T12:00:00Z`);
const today = () => new Date().toISOString().slice(0, 10);

export function ReplacementsPanel({ myDoctorId }: { myDoctorId: string }) {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["pro-replacements"], queryFn: listMyReplacements });
  const [open, setOpen] = useState(false);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["pro-replacements"] });
    qc.invalidateQueries({ queryKey: ["doctor-appointments"] });
  };
  const respond = useMutation({
    mutationFn: (v: { id: string; accept: boolean }) => respondReplacement({ data: v }),
    onSuccess: (r) => {
      toast.success(
        r.status === "accepted"
          ? `Remplacement accepté : ${r.appointments} rendez-vous vous sont confiés`
          : "Proposition refusée",
      );
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const cancel = useMutation({
    mutationFn: (id: string) => cancelReplacement(id),
    onSuccess: (r) => {
      toast.success(
        r.returned_appointments
          ? `Remplacement annulé : ${r.returned_appointments} rendez-vous reviennent au titulaire`
          : "Remplacement annulé",
      );
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });

  const given = data?.given ?? [];
  const received = data?.received ?? [];
  const pendingForMe = received.filter((r) => r.status === "pending");

  return (
    <section
      id="remplacements"
      aria-label="Remplacements"
      className={`rounded-2xl border bg-sunu-card p-5 ${pendingForMe.length ? "border-sunu-gold" : "border-sunu-line"}`}
    >
      <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-sunu-ink/50">
        <UserRoundCheck className="size-4" /> Remplacements
        {pendingForMe.length > 0 && (
          <span className="rounded-full bg-sunu-gold px-2 py-0.5 text-[10px] text-sunu-dark">
            {pendingForMe.length}
          </span>
        )}
      </h2>
      <p className="mt-1 text-xs text-sunu-ink/55">
        Pendant vos congés, un confrère inscrit sur Fajma reçoit vos patients : votre agenda reste
        ouvert, il consulte et signe les ordonnances à son nom. Les paiements restent versés sur
        votre compte ; la rétrocession se règle entre vous.
      </p>

      {received.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="text-xs font-bold uppercase tracking-wider text-sunu-ink/45">
            On vous propose
          </p>
          {received.map((r) => (
            <Row key={r.id} r={r} who={r.doctor.full_name} prefix="Remplacer">
              {r.status === "pending" && (
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => respond.mutate({ id: r.id, accept: true })}
                    disabled={respond.isPending}
                    className="flex items-center gap-1 rounded-lg bg-sunu-teal px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    <Check className="size-3.5" /> Accepter
                  </button>
                  <button
                    onClick={() => respond.mutate({ id: r.id, accept: false })}
                    disabled={respond.isPending}
                    className="flex items-center gap-1 rounded-lg border border-sunu-line px-3 py-1.5 text-xs font-semibold text-sunu-ink/70 disabled:opacity-50"
                  >
                    <X className="size-3.5" /> Refuser
                  </button>
                </div>
              )}
              {r.status === "accepted" && (
                <CancelLink r={r} onCancel={() => cancel.mutate(r.id)} busy={cancel.isPending} />
              )}
            </Row>
          ))}
        </div>
      )}

      {given.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="text-xs font-bold uppercase tracking-wider text-sunu-ink/45">
            Vos remplaçants
          </p>
          {given.map((r) => (
            <Row key={r.id} r={r} who={r.replacement.full_name} prefix="Remplacé par">
              {(r.status === "pending" || r.status === "accepted") && (
                <CancelLink r={r} onCancel={() => cancel.mutate(r.id)} busy={cancel.isPending} />
              )}
            </Row>
          ))}
        </div>
      )}

      {open ? (
        <ProposeForm
          myDoctorId={myDoctorId}
          onDone={() => {
            setOpen(false);
            refresh();
          }}
        />
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="mt-4 w-full rounded-lg border border-sunu-green px-3 py-2 text-xs font-semibold text-sunu-green hover:bg-sunu-green-soft/40"
        >
          Me faire remplacer
        </button>
      )}
    </section>
  );
}

function Row({
  r,
  who,
  prefix,
  children,
}: {
  r: Replacement;
  who: string;
  prefix: string;
  children?: React.ReactNode;
}) {
  const s = STATUS[r.status];
  return (
    <div className="rounded-lg bg-sunu-surface px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sunu-ink/80">
          {prefix} <b className="text-sunu-dark">{who}</b>
        </span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${s.cls}`}>
          {r.ongoing ? "En cours" : s.label}
        </span>
      </div>
      <p className="text-xs text-sunu-ink/60">
        Du {day(r.starts_on)} au {day(r.ends_on)}
        {r.status !== "declined" && r.status !== "cancelled" && ` · ${r.appointments} RDV`}
      </p>
      {r.note && <p className="mt-0.5 text-xs italic text-sunu-ink/55">« {r.note} »</p>}
      {children}
    </div>
  );
}

function CancelLink({
  r,
  onCancel,
  busy,
}: {
  r: Replacement;
  onCancel: () => void;
  busy: boolean;
}) {
  if (new Date(r.ends_at).getTime() <= Date.now()) return null;
  return (
    <button
      onClick={() => {
        if (
          window.confirm(
            "Annuler ce remplacement ? Les rendez-vous à venir reviendront au titulaire.",
          )
        )
          onCancel();
      }}
      disabled={busy}
      className="mt-1 text-xs font-semibold text-red-600 hover:underline disabled:opacity-50"
    >
      Annuler le remplacement
    </button>
  );
}

function ProposeForm({ myDoctorId, onDone }: { myDoctorId: string; onDone: () => void }) {
  const { data: doctors, isLoading } = useQuery({
    queryKey: ["clinic-candidates"],
    queryFn: listClinicCandidates,
  });
  const [q, setQ] = useState("");
  const [doctorId, setDoctorId] = useState("");
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [note, setNote] = useState("");
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const options = (doctors ?? [])
    .filter((d) => d.id !== myDoctorId)
    .filter(
      (d) => !q || norm(`${d.full_name} ${d.city} ${d.specialty?.name ?? ""}`).includes(norm(q)),
    )
    .slice(0, 30);
  const propose = useMutation({
    mutationFn: () =>
      proposeReplacement({
        data: {
          replacement_doctor_id: doctorId,
          starts_on: from,
          ends_on: to,
          note: note || undefined,
        },
      }),
    onSuccess: (r) => {
      toast.success(`Proposition envoyée à ${r.replacement.full_name}`);
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });
  const field = "w-full rounded-lg border border-sunu-line bg-sunu-card px-3 py-2 text-sm";
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!doctorId) return toast.error("Choisissez votre remplaçant");
        if (to < from) return toast.error("La fin doit être après le début");
        propose.mutate();
      }}
      className="mt-4 grid gap-2 border-t border-sunu-line pt-4"
    >
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Rechercher un confrère (nom, ville, spécialité)"
        aria-label="Rechercher un confrère"
        className={field}
      />
      {isLoading ? (
        <Loader2 className="mx-auto size-4 animate-spin text-sunu-green" />
      ) : (
        <select
          value={doctorId}
          onChange={(e) => setDoctorId(e.target.value)}
          aria-label="Remplaçant"
          className={field}
        >
          <option value="">— Choisir le remplaçant —</option>
          {options.map((d) => (
            <option key={d.id} value={d.id}>
              {d.full_name} · {d.specialty?.name ?? "Médecin"} · {d.city}
            </option>
          ))}
        </select>
      )}
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-sunu-ink/60">
          Du
          <input
            type="date"
            min={today()}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className={`mt-1 ${field}`}
          />
        </label>
        <label className="text-xs text-sunu-ink/60">
          Au (inclus)
          <input
            type="date"
            min={from}
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className={`mt-1 ${field}`}
          />
        </label>
      </div>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={300}
        placeholder="Message (facultatif) : horaires, clés du cabinet…"
        className={field}
      />
      <p className="text-[11px] text-sunu-ink/50">
        Ne déclarez pas d'absence sur cette période : vos créneaux doivent rester ouverts pour que
        vos patients puissent réserver avec votre remplaçant.
      </p>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={propose.isPending}
          className="flex-1 rounded-lg bg-sunu-green px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
        >
          Envoyer la proposition
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded-lg border border-sunu-line px-3 py-2 text-xs font-semibold text-sunu-ink/70"
        >
          Fermer
        </button>
      </div>
    </form>
  );
}
