/**
 * Fiche d'un plateau technique (laboratoire d'analyses, centre d'imagerie, ou les deux) : téléphone,
 * horaires, adresse, quartier et examens d'imagerie réalisés, modifiés par le centre lui-même ; nom et
 * ville en plus pour l'administration. La position sur la carte suit le quartier ou la ville.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { FlaskConical, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  adminUpdateLab,
  getImagingModalities,
  updateMyLab,
  type LabKind,
  type Laboratory,
} from "@/api/labs";

const KINDS: [LabKind, string][] = [
  ["analyses", "Analyses médicales"],
  ["imagerie", "Imagerie médicale"],
  ["both", "Analyses et imagerie"],
];

export function LabEditor({
  lab,
  admin = false,
  onDone,
}: {
  lab: Laboratory;
  admin?: boolean;
  onDone?: () => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: lab.name,
    city: lab.city,
    district: lab.district ?? "",
    address: lab.address,
    phone: lab.phone ?? "",
    opening_hours: lab.opening_hours ?? "",
  });
  const [kind, setKind] = useState<LabKind>(lab.kind);
  const [modalities, setModalities] = useState<string[]>(lab.modalities ?? []);
  const { data: catalog } = useQuery({
    queryKey: ["imaging-modalities"],
    queryFn: getImagingModalities,
    staleTime: Infinity,
  });
  const doesImaging = kind === "imagerie" || kind === "both";
  const toggle = (code: string) =>
    setModalities((v) => (v.includes(code) ? v.filter((c) => c !== code) : [...v, code]));
  const save = useMutation({
    mutationFn: (): Promise<unknown> =>
      admin
        ? adminUpdateLab(lab.id, { ...form, kind, modalities })
        : updateMyLab({
            laboratory_id: lab.id,
            district: form.district,
            address: form.address,
            phone: form.phone,
            opening_hours: form.opening_hours,
            kind,
            modalities,
          }),
    onSuccess: () => {
      toast.success("Fiche enregistrée");
      qc.invalidateQueries({ queryKey: ["lab-dashboard"] });
      qc.invalidateQueries({ queryKey: ["admin-labs"] });
      onDone?.();
    },
    onError: (e) => toast.error(e.message),
  });
  const field = "w-full rounded-lg border border-sunu-line bg-sunu-card px-3 py-2 text-sm";
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });

  return (
    <form
      aria-label={`Fiche de ${lab.name}`}
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
      className={
        admin
          ? "mt-2 grid content-start gap-2 rounded-lg bg-sunu-surface p-3 sm:grid-cols-2"
          : "grid content-start gap-2 self-start rounded-2xl border border-sunu-line bg-sunu-card p-5 sm:grid-cols-2"
      }
    >
      {!admin && (
        <div className="sm:col-span-2">
          <h2 className="flex items-center gap-2 font-bold text-sunu-dark">
            <FlaskConical className="size-4 text-sunu-green" /> {lab.name}
          </h2>
          <p className="text-xs text-sunu-ink/55">
            Informations affichées aux patients. Pour changer le nom ou la ville, contactez l'équipe
            Fajma.
          </p>
        </div>
      )}
      {admin && (
        <>
          <label className="grid gap-1 text-xs font-semibold text-sunu-ink/60">
            Nom
            <input
              required
              minLength={2}
              value={form.name}
              onChange={set("name")}
              aria-label="Nom"
              placeholder="Nom"
              className={field}
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-sunu-ink/60">
            Ville
            <input
              required
              minLength={2}
              value={form.city}
              onChange={set("city")}
              aria-label="Ville"
              placeholder="Ville"
              className={field}
            />
          </label>
        </>
      )}
      <label className="grid gap-1 text-xs font-semibold text-sunu-ink/60">
        Quartier
        <input
          value={form.district}
          onChange={set("district")}
          aria-label="Quartier"
          placeholder="Quartier"
          className={field}
        />
      </label>
      <label className="grid gap-1 text-xs font-semibold text-sunu-ink/60">
        Adresse
        <input
          required
          minLength={3}
          value={form.address}
          onChange={set("address")}
          aria-label="Adresse"
          placeholder="Adresse"
          className={field}
        />
      </label>
      <label className="grid gap-1 text-xs font-semibold text-sunu-ink/60">
        Téléphone
        <input
          type="tel"
          value={form.phone}
          onChange={set("phone")}
          aria-label="Téléphone"
          placeholder="Téléphone"
          className={field}
        />
      </label>
      <label className="grid gap-1 text-xs font-semibold text-sunu-ink/60">
        Horaires
        <input
          value={form.opening_hours}
          onChange={set("opening_hours")}
          aria-label="Horaires"
          placeholder="Horaires (ex. lun.–sam. 7 h 30 – 18 h)"
          className={field}
        />
      </label>
      <label className="grid gap-1 text-xs font-semibold text-sunu-ink/60 sm:col-span-2">
        Ce que fait cet établissement
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as LabKind)}
          aria-label="Type d'établissement"
          className={field}
        >
          {KINDS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {doesImaging && (
        <fieldset className="sm:col-span-2">
          <legend className="text-xs font-semibold text-sunu-ink/60">
            Examens d'imagerie réalisés (les patients ne vous verront que pour ceux-ci)
          </legend>
          <div className="mt-1 flex flex-wrap gap-2">
            {(catalog ?? []).map((m) => (
              <label
                key={m.code}
                className={`cursor-pointer rounded-lg border px-2.5 py-1.5 text-xs ${
                  modalities.includes(m.code)
                    ? "border-sunu-green bg-sunu-green-soft text-sunu-green"
                    : "border-sunu-line text-sunu-ink/70"
                }`}
              >
                <input
                  type="checkbox"
                  checked={modalities.includes(m.code)}
                  onChange={() => toggle(m.code)}
                  className="sr-only"
                />
                {m.label}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <div className="flex gap-2 sm:col-span-2">
        <button
          disabled={save.isPending}
          className="flex items-center gap-1.5 rounded-lg bg-sunu-green px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
        >
          {save.isPending && <Loader2 className="size-3.5 animate-spin" />} Enregistrer
        </button>
        {onDone && (
          <button
            type="button"
            onClick={onDone}
            className="rounded-lg border border-sunu-line px-4 py-2 text-xs font-semibold text-sunu-ink/70"
          >
            Annuler
          </button>
        )}
      </div>
    </form>
  );
}
