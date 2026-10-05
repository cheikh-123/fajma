/**
 * Administration : correction du nom ou de la spécialité d'une fiche médecin (le médecin ne peut plus les changer
 * seul une fois vérifié). Motif obligatoire, journalisé ; le médecin est prévenu.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { correctDoctor } from "@/api/admin";
import { listSpecialties } from "@/api/directory";

export function DoctorCorrection({
  doctor,
  onDone,
}: {
  doctor: { id: string; full_name: string; specialty_id: string };
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const { data: specialties } = useQuery({ queryKey: ["specialties"], queryFn: listSpecialties });
  const [form, setForm] = useState({
    full_name: doctor.full_name,
    specialty_id: doctor.specialty_id,
    reason: "",
  });
  const save = useMutation({
    mutationFn: () => correctDoctor(doctor.id, form),
    onSuccess: () => {
      toast.success("Fiche corrigée, le médecin est prévenu");
      qc.invalidateQueries({ queryKey: ["admin-overview"] });
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });
  const field = "w-full rounded-lg border border-sunu-line bg-sunu-card px-3 py-2 text-sm";
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
      className="mb-3 grid gap-2 rounded-lg bg-sunu-surface p-3"
    >
      <input
        required
        minLength={2}
        aria-label="Nom affiché"
        value={form.full_name}
        onChange={(e) => setForm({ ...form, full_name: e.target.value })}
        className={field}
      />
      <select
        aria-label="Spécialité"
        value={form.specialty_id}
        onChange={(e) => setForm({ ...form, specialty_id: e.target.value })}
        className={field}
      >
        {(specialties ?? []).map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <input
        required
        minLength={3}
        aria-label="Motif"
        placeholder="Motif et justificatif (ex. acte de mariage reçu le …)"
        value={form.reason}
        onChange={(e) => setForm({ ...form, reason: e.target.value })}
        className={field}
      />
      <div className="flex gap-2">
        <button
          disabled={save.isPending}
          className="flex items-center gap-1.5 rounded-lg bg-sunu-green px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
        >
          {save.isPending && <Loader2 className="size-3.5 animate-spin" />} Corriger la fiche
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded-lg border border-sunu-line px-4 py-2 text-xs font-semibold text-sunu-ink/70"
        >
          Annuler
        </button>
      </div>
    </form>
  );
}
