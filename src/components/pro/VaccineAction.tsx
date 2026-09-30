/** Agenda du médecin : inscrire dans le carnet du patient (ou de l'enfant) un vaccin fait en consultation. */
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Syringe } from "lucide-react";
import { toast } from "sonner";
import { doctorRecordDose, listVaccines } from "@/api/carnet";

export function VaccineAction({ appointmentId }: { appointmentId: string }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const { data: vaccines } = useQuery({
    queryKey: ["vaccine-catalog"],
    queryFn: listVaccines,
    enabled: open,
    staleTime: Infinity,
  });
  const save = useMutation({
    mutationFn: () =>
      doctorRecordDose({ data: { appointment_id: appointmentId, vaccine_code: code } }),
    onSuccess: (r) => {
      toast.success(`${r.vaccine} inscrit dans le carnet`);
      setOpen(false);
      setCode("");
    },
    onError: (e) => toast.error(e.message),
  });

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-sunu-teal hover:underline"
      >
        <Syringe className="size-3" /> Vaccin fait
      </button>
    );
  }
  return (
    <span className="mt-1 flex flex-wrap items-center gap-1">
      <select
        aria-label="Vaccin administré"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        className="rounded border border-sunu-line px-1.5 py-1 text-xs"
      >
        <option value="">Vaccin…</option>
        {(vaccines ?? []).map((v) => (
          <option key={v.code} value={v.code}>
            {v.name} ({v.age_label})
          </option>
        ))}
      </select>
      <button
        disabled={!code || save.isPending}
        onClick={() => save.mutate()}
        className="rounded bg-sunu-teal px-2 py-1 text-xs font-semibold text-white disabled:opacity-50"
      >
        Inscrire
      </button>
      <button onClick={() => setOpen(false)} className="text-xs text-sunu-ink/50">
        Annuler
      </button>
    </span>
  );
}
