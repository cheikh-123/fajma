/** Secrétariat : fichier patients de la clinique, recherche et gestion des doublons. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { BadgeCheck, Link2, Search, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { linkPatientAccount, listClinicPatients, unifyPatientName } from "@/api/clinic";
import { formatDate } from "@/lib/datetime";

export function PatientsDirectory({ clinicId }: { clinicId: string }) {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["clinic-patients", clinicId, q],
    queryFn: () => listClinicPatients({ data: { clinic_id: clinicId, q } }),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["clinic-patients", clinicId] });
  const unify = useMutation({
    mutationFn: (v: { phone: string; name: string }) =>
      unifyPatientName({ data: { clinic_id: clinicId, ...v } }),
    onSuccess: (r) => {
      toast.success(`Nom unifié sur ${r.updated} rendez-vous`);
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const link = useMutation({
    mutationFn: (phone: string) => linkPatientAccount({ data: { clinic_id: clinicId, phone } }),
    onSuccess: (r) => {
      toast.success(`${r.updated} rendez-vous rattachés au compte du patient`);
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const duplicates = (data ?? []).filter(
    (r) => r.name_variants.length > 0 || r.matching_account,
  ).length;

  return (
    <section
      aria-label="Fichier patients"
      className="rounded-xl border border-sunu-line bg-sunu-card p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-bold text-sunu-dark">Fichier patients</h2>
        {duplicates > 0 && (
          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
            {duplicates} doublon(s) à traiter
          </span>
        )}
      </div>
      <label className="mt-3 flex items-center gap-2 rounded-lg border border-sunu-line px-3 py-2">
        <Search className="size-4 text-sunu-ink/40" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Rechercher par nom ou téléphone"
          aria-label="Rechercher un patient"
          className="w-full text-sm outline-none"
        />
      </label>
      <div className="mt-3 divide-y divide-sunu-line">
        {!isLoading && (data ?? []).length === 0 && (
          <p className="py-8 text-center text-sm text-sunu-ink/50">Aucun patient trouvé.</p>
        )}
        {(data ?? []).map((p) => (
          <div
            key={p.key}
            className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
          >
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 font-semibold text-sunu-dark">
                {p.name}
                {p.registered && (
                  <span title="Compte Fajma" className="text-sunu-green">
                    <BadgeCheck className="size-4" />
                  </span>
                )}
              </p>
              <p className="text-xs text-sunu-ink/55">
                {p.phone ?? "Pas de téléphone"} · {p.appointments} RDV
                {p.last_visit && ` · dernière visite le ${formatDate(p.last_visit)}`}
                {p.next_appointment && ` · prochain RDV le ${formatDate(p.next_appointment)}`}
              </p>
              {p.name_variants.length > 0 && (
                <p className="text-xs text-amber-700">
                  Saisi sous plusieurs noms : {p.name_variants.join(" / ")}
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {p.name_variants.length > 0 && p.phone && (
                <button
                  onClick={() => {
                    const name = window.prompt(
                      "Nom à conserver pour ce patient :",
                      p.name_variants[0],
                    );
                    if (name) unify.mutate({ phone: p.phone!, name });
                  }}
                  className="flex items-center gap-1 rounded-lg border border-sunu-line px-2.5 py-1.5 text-xs font-semibold text-sunu-ink/70"
                >
                  <Wand2 className="size-3.5" /> Unifier le nom
                </button>
              )}
              {p.matching_account && p.phone && (
                <button
                  onClick={() => link.mutate(p.phone!)}
                  className="flex items-center gap-1 rounded-lg bg-sunu-green-soft px-2.5 py-1.5 text-xs font-semibold text-sunu-green"
                >
                  <Link2 className="size-3.5" /> Rattacher au compte de {p.matching_account.name}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
