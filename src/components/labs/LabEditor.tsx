/**
 * Fiche d'un laboratoire : téléphone, horaires, adresse et quartier (modifiés par le laboratoire lui-même) ;
 * nom et ville en plus pour l'administration. La position sur la carte suit le quartier ou la ville.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { FlaskConical, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { adminUpdateLab, updateMyLab, type Laboratory } from "@/api/labs";

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
  const save = useMutation({
    mutationFn: (): Promise<unknown> =>
      admin
        ? adminUpdateLab(lab.id, form)
        : updateMyLab({
            laboratory_id: lab.id,
            district: form.district,
            address: form.address,
            phone: form.phone,
            opening_hours: form.opening_hours,
          }),
    onSuccess: () => {
      toast.success("Fiche du laboratoire enregistrée");
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
