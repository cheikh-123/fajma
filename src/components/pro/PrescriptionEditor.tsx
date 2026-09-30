/**
 * Rédaction d'une ordonnance par le médecin : un médicament par ligne (nom, dosage, posologie, durée,
 * quantité, non substituable), patient (date de naissance, sexe, poids), renouvellements, validité.
 * Rappelle les allergies et traitements en cours déclarés par le patient.
 */
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import { getPatientFile } from "@/api/doctor";
import type { DoctorAppointment, PrescriptionItem, Sex } from "@/api/types";
import { emptyItem, type PrescriptionDraft } from "@/lib/prescription-draft";

// Médicaments courants (DCI) proposés pendant la saisie ; le médecin peut écrire n'importe quel nom.
const COMMON_DRUGS = [
  "Paracétamol",
  "Ibuprofène",
  "Diclofénac",
  "Amoxicilline",
  "Amoxicilline + acide clavulanique",
  "Azithromycine",
  "Ciprofloxacine",
  "Doxycycline",
  "Cotrimoxazole",
  "Métronidazole",
  "Artéméther + luméfantrine",
  "Artésunate + amodiaquine",
  "Quinine",
  "Albendazole",
  "Mébendazole",
  "Sels de réhydratation orale (SRO)",
  "Zinc",
  "Fer + acide folique",
  "Oméprazole",
  "Cétirizine",
  "Salbutamol",
  "Prednisolone",
  "Metformine",
  "Glibenclamide",
  "Amlodipine",
  "Hydrochlorothiazide",
  "Losartan",
  "Nifédipine",
];

const box = "rounded-lg border border-sunu-line bg-sunu-card px-2.5 py-1.5 text-sm";

export function PrescriptionEditor({
  appt,
  value,
  onChange,
}: {
  appt: DoctorAppointment;
  value: PrescriptionDraft;
  onChange: (v: PrescriptionDraft) => void;
}) {
  // Le profil de santé est celui du titulaire du compte : on ne l'affiche pas pour un proche.
  const { data: file } = useQuery({
    queryKey: ["patient-file", appt.patient_id],
    queryFn: () => getPatientFile({ data: { patient_id: appt.patient_id! } }),
    enabled: !!appt.patient_id && !appt.relative,
    staleTime: 60_000,
  });
  const hp = file?.health_profile;
  const set = (patch: Partial<PrescriptionDraft>) => onChange({ ...value, ...patch });
  const setItem = (i: number, patch: Partial<PrescriptionItem>) =>
    set({ items: value.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) });

  return (
    <div className="rounded-xl border border-sunu-line p-3">
      <p className="text-xs font-bold uppercase tracking-wider text-sunu-green">
        Ordonnance{" "}
        <span className="font-normal normal-case text-sunu-ink/50">
          (facultatif — laissez vide s'il n'y a rien à prescrire)
        </span>
      </p>

      {(hp?.allergies || hp?.treatments) && (
        <div className="mt-2 flex gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
          <AlertTriangle className="size-4 shrink-0" />
          <div>
            {hp.allergies && (
              <p>
                <strong>Allergies déclarées :</strong> {hp.allergies}
              </p>
            )}
            {hp.treatments && (
              <p>
                <strong>Traitements en cours :</strong> {hp.treatments}
              </p>
            )}
          </div>
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <label className="text-[11px] font-semibold text-sunu-ink/60">
          Date de naissance
          <input
            type="date"
            value={value.patient_birth_date}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => set({ patient_birth_date: e.target.value })}
            className={`mt-0.5 w-full ${box}`}
          />
        </label>
        <label className="text-[11px] font-semibold text-sunu-ink/60">
          Sexe
          <select
            value={value.patient_sex}
            onChange={(e) => set({ patient_sex: e.target.value as Sex | "" })}
            className={`mt-0.5 w-full ${box}`}
          >
            <option value="">—</option>
            <option value="F">Féminin</option>
            <option value="M">Masculin</option>
          </select>
        </label>
        <label className="text-[11px] font-semibold text-sunu-ink/60">
          Poids (kg){appt.relative ? " — conseillé pour un enfant" : ""}
          <input
            inputMode="decimal"
            value={value.patient_weight_kg}
            onChange={(e) => set({ patient_weight_kg: e.target.value })}
            placeholder="Ex. 18,5"
            className={`mt-0.5 w-full ${box}`}
          />
        </label>
      </div>

      <datalist id="common-drugs">
        {COMMON_DRUGS.map((d) => (
          <option key={d} value={d} />
        ))}
      </datalist>
      <ol className="mt-3 space-y-2">
        {value.items.map((it, i) => (
          <li key={i} className="rounded-lg bg-sunu-surface p-2.5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-sunu-green">{i + 1}.</span>
              <input
                list="common-drugs"
                value={it.name}
                onChange={(e) => setItem(i, { name: e.target.value })}
                placeholder="Médicament (nom ou DCI)"
                aria-label={`Médicament ${i + 1}`}
                className={`min-w-0 flex-[2] ${box}`}
              />
              <input
                value={it.dosage}
                onChange={(e) => setItem(i, { dosage: e.target.value })}
                placeholder="Dosage (500 mg)"
                aria-label="Dosage"
                className={`min-w-0 flex-1 ${box}`}
              />
              {value.items.length > 1 && (
                <button
                  type="button"
                  onClick={() => set({ items: value.items.filter((_, j) => j !== i) })}
                  aria-label="Retirer ce médicament"
                  className="text-sunu-ink/40 hover:text-red-600"
                >
                  <Trash2 className="size-4" />
                </button>
              )}
            </div>
            <input
              value={it.posology}
              onChange={(e) => setItem(i, { posology: e.target.value })}
              placeholder="Posologie (ex. 1 comprimé matin, midi et soir pendant les repas)"
              aria-label="Posologie"
              className={`mt-2 w-full ${box}`}
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                value={it.duration}
                onChange={(e) => setItem(i, { duration: e.target.value })}
                placeholder="Durée (7 jours)"
                aria-label="Durée"
                className={`w-32 ${box}`}
              />
              <input
                value={it.quantity}
                onChange={(e) => setItem(i, { quantity: e.target.value })}
                placeholder="Quantité (2 boîtes)"
                aria-label="Quantité"
                className={`w-36 ${box}`}
              />
              <label className="flex items-center gap-1.5 text-xs text-sunu-ink/70">
                <input
                  type="checkbox"
                  checked={it.non_substitutable}
                  onChange={(e) => setItem(i, { non_substitutable: e.target.checked })}
                />
                Non substituable
              </label>
            </div>
          </li>
        ))}
      </ol>
      <button
        type="button"
        onClick={() => set({ items: [...value.items, emptyItem()] })}
        className="mt-2 flex items-center gap-1 text-xs font-semibold text-sunu-green"
      >
        <Plus className="size-3.5" /> Ajouter un médicament
      </button>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <label className="text-[11px] font-semibold text-sunu-ink/60">
          Renouvellement
          <select
            value={value.renewals}
            onChange={(e) => set({ renewals: Number(e.target.value) })}
            className={`mt-0.5 w-full ${box}`}
          >
            <option value={0}>Non renouvelable</option>
            {[1, 2, 3, 5, 11].map((n) => (
              <option key={n} value={n}>
                À renouveler {n} fois
              </option>
            ))}
          </select>
        </label>
        <label className="text-[11px] font-semibold text-sunu-ink/60">
          Validité
          <select
            value={value.validity_months}
            onChange={(e) => set({ validity_months: Number(e.target.value) })}
            className={`mt-0.5 w-full ${box}`}
          >
            <option value={1}>1 mois</option>
            <option value={3}>3 mois</option>
            <option value={6}>6 mois</option>
            <option value={12}>12 mois</option>
          </select>
        </label>
      </div>
      <textarea
        value={value.instructions}
        onChange={(e) => set({ instructions: e.target.value })}
        placeholder="Conseils au patient (facultatif) : régime, surveillance, quand reconsulter…"
        className={`mt-2 min-h-16 w-full ${box}`}
      />
    </div>
  );
}
