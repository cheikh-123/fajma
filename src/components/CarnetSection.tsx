/** Dossier : carnet de santé familial (vaccins de chaque membre, suivi de grossesse). */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Baby, BadgeCheck, BookHeart, Check, Syringe, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  deleteDose,
  endPregnancy,
  getCarnet,
  recordDose,
  recordPrenatalVisit,
  startPregnancy,
  type CarnetPerson,
  type PregnancyFollowUp,
  type VaccineStatus,
} from "@/api/carnet";
import { formatDate } from "@/lib/datetime";
import { useI18n } from "@/lib/i18n";

const STATUS: Record<VaccineStatus, { label: string; cls: string }> = {
  done: { label: "Fait", cls: "bg-sunu-teal/15 text-sunu-teal" },
  late: { label: "En retard", cls: "bg-red-100 text-red-700" },
  due: { label: "À faire", cls: "bg-amber-100 text-amber-800" },
  upcoming: { label: "À venir", cls: "bg-sunu-surface text-sunu-ink/60" },
  unknown: { label: "—", cls: "bg-sunu-surface text-sunu-ink/50" },
};
const todayIso = () => new Date().toISOString().slice(0, 10);

export function CarnetSection() {
  const { t } = useI18n();
  const { data } = useQuery({ queryKey: ["carnet"], queryFn: getCarnet });
  // Par défaut : le premier enfant avec une date de naissance (le calendrier ne s'applique qu'aux enfants).
  const [selected, setSelected] = useState<string | null | undefined>(undefined);
  if (!data) return null;
  const defaultId = data.people.find((p) => p.birth_date)?.id ?? null;
  const personId = selected === undefined ? defaultId : selected;
  const person = data.people.find((p) => p.id === personId) ?? data.people[0];
  const active = data.pregnancies.find((p) => p.status === "active");

  return (
    <section id="carnet">
      <h2 className="mb-1 flex items-center gap-2 text-lg font-bold text-sunu-dark">
        <BookHeart className="size-5 text-sunu-green" /> {t("dossier.carnet")}
      </h2>
      <p className="mb-3 text-xs text-sunu-ink/55">{t("dossier.carnetIntro")}</p>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-sunu-line bg-sunu-card p-5 lg:col-span-2">
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Membre de la famille">
            {data.people.map((p) => (
              <button
                key={p.id ?? "me"}
                role="tab"
                aria-selected={p.id === person.id}
                onClick={() => setSelected(p.id)}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${p.id === person.id ? "bg-sunu-green text-white" : "bg-sunu-surface text-sunu-ink/70"}`}
              >
                {p.id ? p.full_name : "Moi"}
              </button>
            ))}
          </div>
          <VaccinationTable person={person} />
        </div>
        <PregnancyCard pregnancy={active ?? null} />
      </div>
    </section>
  );
}

function VaccinationTable({ person }: { person: CarnetPerson }) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["carnet"] });
  const [editing, setEditing] = useState<string | null>(null);
  const [date, setDate] = useState(todayIso());
  const save = useMutation({
    mutationFn: (code: string) =>
      recordDose({
        data: { vaccine_code: code, given_on: date, relative_id: person.id ?? undefined },
      }),
    onSuccess: () => {
      toast.success("Vaccin inscrit dans le carnet");
      setEditing(null);
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: deleteDose,
    onSuccess: refresh,
    onError: (e) => toast.error(e.message),
  });
  const late = person.vaccinations.filter((v) => v.status === "late").length;

  return (
    <div className="mt-4">
      {!person.birth_date && (
        <p className="mb-2 rounded-lg bg-sunu-surface px-3 py-2 text-xs text-sunu-ink/60">
          Sans date de naissance, les échéances ne peuvent pas être calculées. Vous pouvez tout de
          même inscrire les vaccins reçus.
        </p>
      )}
      {late > 0 && (
        <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
          {late} vaccin(s) en retard ou non inscrit(s) : vérifiez le carnet papier et parlez-en au
          poste de santé.
        </p>
      )}
      <ul className="divide-y divide-sunu-line">
        {person.vaccinations.map((v) => (
          <li
            key={v.code}
            className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
          >
            <div className="min-w-0">
              <p className="font-medium text-sunu-dark">{v.name}</p>
              <p className="text-xs text-sunu-ink/50">
                {v.age_label}
                {v.due_date && ` · prévu le ${formatDate(v.due_date)}`}
                {v.given_on && ` · fait le ${formatDate(v.given_on)}`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {v.verified && (
                <span title="Inscrit par un médecin" className="text-sunu-green">
                  <BadgeCheck className="size-4" />
                </span>
              )}
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS[v.status].cls}`}
              >
                {STATUS[v.status].label}
              </span>
              {v.status === "done" && !v.verified && v.dose_id && (
                <button
                  onClick={() => remove.mutate(v.dose_id!)}
                  aria-label={`Retirer ${v.name}`}
                  className="text-sunu-ink/30 hover:text-red-600"
                >
                  <Trash2 className="size-3.5" />
                </button>
              )}
              {v.status !== "done" &&
                (editing === v.code ? (
                  <span className="flex items-center gap-1">
                    <input
                      type="date"
                      min={person.birth_date ?? undefined}
                      max={todayIso()}
                      value={date}
                      aria-label={`Date du vaccin ${v.name}`}
                      onChange={(e) => setDate(e.target.value)}
                      className="rounded border border-sunu-line px-1.5 py-0.5 text-xs"
                    />
                    <button
                      onClick={() => save.mutate(v.code)}
                      disabled={save.isPending}
                      aria-label="Valider"
                      className="rounded bg-sunu-teal p-1 text-white"
                    >
                      <Check className="size-3.5" />
                    </button>
                  </span>
                ) : (
                  <button
                    onClick={() => {
                      setEditing(v.code);
                      setDate(todayIso());
                    }}
                    className="inline-flex items-center gap-1 rounded-lg border border-sunu-line px-2 py-1 text-xs font-semibold text-sunu-ink/70 hover:border-sunu-teal hover:text-sunu-teal"
                  >
                    <Syringe className="size-3" /> Fait
                  </button>
                ))}
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[11px] text-sunu-ink/45">
        Calendrier de routine du Programme élargi de vaccination. En cas de doute, suivez les
        consignes de l'agent de santé.
      </p>
    </div>
  );
}

function PregnancyCard({ pregnancy }: { pregnancy: PregnancyFollowUp | null }) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["carnet"] });
  const [lmp, setLmp] = useState("");
  const [childName, setChildName] = useState("");
  const start = useMutation({
    mutationFn: () => startPregnancy(lmp),
    onSuccess: () => {
      toast.success(
        "Suivi de grossesse démarré : vous serez prévenue avant chaque consultation prénatale.",
      );
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const visit = useMutation({
    mutationFn: (contact: number) =>
      recordPrenatalVisit({ data: { id: pregnancy!.id, contact, done_on: todayIso() } }),
    onSuccess: refresh,
    onError: (e) => toast.error(e.message),
  });
  const birth = useMutation({
    mutationFn: () =>
      endPregnancy({ data: { id: pregnancy!.id, outcome: "birth", child_name: childName } }),
    onSuccess: () => {
      toast.success(`Félicitations ! Le carnet de vaccination de ${childName} est créé.`);
      refresh();
      qc.invalidateQueries({ queryKey: ["my-relatives"] });
    },
    onError: (e) => toast.error(e.message),
  });

  if (!pregnancy) {
    return (
      <div className="rounded-xl border border-sunu-line bg-sunu-card p-5">
        <h3 className="flex items-center gap-2 font-semibold text-sunu-dark">
          <Baby className="size-4 text-sunu-teal" /> Suivi de grossesse
        </h3>
        <p className="mt-1 text-xs text-sunu-ink/55">Terme, consultations prénatales et rappels.</p>
        <form
          className="mt-3 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            start.mutate();
          }}
        >
          <label className="grid gap-1 text-xs font-semibold text-sunu-ink/60">
            Premier jour des dernières règles
            <input
              type="date"
              required
              max={todayIso()}
              value={lmp}
              onChange={(e) => setLmp(e.target.value)}
              className="rounded-lg border border-sunu-line px-3 py-2 text-sm"
            />
          </label>
          <button
            disabled={start.isPending}
            className="w-full rounded-lg bg-sunu-teal px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Démarrer le suivi
          </button>
        </form>
      </div>
    );
  }

  const next = pregnancy.visits.find((v) => v.status !== "done");
  return (
    <div className="rounded-xl border border-sunu-line bg-sunu-card p-5">
      <h3 className="flex items-center gap-2 font-semibold text-sunu-dark">
        <Baby className="size-4 text-sunu-teal" /> Grossesse : {pregnancy.weeks} SA{" "}
        {pregnancy.days > 0 && `+ ${pregnancy.days} j`}
      </h3>
      <p className="text-xs text-sunu-ink/55">
        Terme prévu le {formatDate(pregnancy.due_date, { dateStyle: "long" })}
      </p>
      <div className="mt-2 h-2 rounded-full bg-sunu-surface">
        <div
          className="h-2 rounded-full bg-sunu-teal"
          style={{ width: `${Math.min(100, (pregnancy.weeks / 40) * 100)}%` }}
        />
      </div>
      <h4 className="mt-4 text-xs font-bold uppercase tracking-wider text-sunu-ink/50">
        Consultations prénatales
      </h4>
      <ul className="mt-1 space-y-1">
        {pregnancy.visits.map((v) => (
          <li key={v.contact} className="flex items-center justify-between gap-2 text-xs">
            <span className={v.status === "late" ? "text-red-600" : "text-sunu-ink/70"}>
              CPN {v.contact} · {v.week} SA · vers le {formatDate(v.target_date)}
            </span>
            {v.status === "done" ? (
              <span className="font-semibold text-sunu-teal">Faite</span>
            ) : (
              v.contact === next?.contact && (
                <button
                  onClick={() => visit.mutate(v.contact)}
                  disabled={visit.isPending}
                  className="rounded border border-sunu-line px-2 py-0.5 font-semibold text-sunu-ink/70 hover:border-sunu-teal"
                >
                  Faite aujourd'hui
                </button>
              )
            )}
          </li>
        ))}
      </ul>
      {pregnancy.weeks >= 22 && (
        <form
          className="mt-4 space-y-2 border-t border-sunu-line pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            birth.mutate();
          }}
        >
          <p className="text-xs font-semibold text-sunu-ink/60">
            Bébé est né ? Créez son carnet de vaccination.
          </p>
          <input
            required
            minLength={2}
            placeholder="Prénom et nom du bébé"
            value={childName}
            onChange={(e) => setChildName(e.target.value)}
            className="w-full rounded-lg border border-sunu-line px-3 py-2 text-sm"
          />
          <button
            disabled={birth.isPending}
            className="w-full rounded-lg border border-sunu-teal px-3 py-2 text-sm font-semibold text-sunu-teal disabled:opacity-50"
          >
            Déclarer la naissance (aujourd'hui)
          </button>
        </form>
      )}
    </div>
  );
}
