/** Espace médecin : organismes acceptés (IPM, mutuelles, assureurs) et tiers payant. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ShieldPlus } from "lucide-react";
import { toast } from "sonner";
import { getMyAcceptedInsurers, listInsurers, setMyAcceptedInsurers } from "@/api/insurance";

export function InsurersPanel() {
  const qc = useQueryClient();
  const { data: insurers } = useQuery({ queryKey: ["insurers"], queryFn: listInsurers });
  const { data: accepted } = useQuery({
    queryKey: ["pro-insurers"],
    queryFn: getMyAcceptedInsurers,
  });
  // Brouillon local : null tant que le médecin n'a rien modifié.
  const [draft, setDraft] = useState<Record<string, boolean> | null>(null);
  const current = draft ?? Object.fromEntries((accepted ?? []).map((a) => [a.id, a.tiers_payant]));

  const save = useMutation({
    mutationFn: () =>
      setMyAcceptedInsurers({
        data: Object.entries(current).map(([insurer_id, tiers_payant]) => ({
          insurer_id,
          tiers_payant,
        })),
      }),
    onSuccess: (res) => {
      qc.setQueryData(["pro-insurers"], res);
      setDraft(null);
      toast.success("Assurances acceptées mises à jour");
    },
    onError: (e) => toast.error(e.message),
  });
  const toggle = (id: string) => {
    const next = { ...current };
    if (id in next) delete next[id];
    else next[id] = false;
    setDraft(next);
  };

  return (
    <section
      aria-label="Assurances acceptées"
      className="rounded-2xl border border-sunu-line bg-sunu-card p-5"
    >
      <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-sunu-ink/50">
        <ShieldPlus className="size-4" /> Assurances acceptées
      </h2>
      <p className="mt-1 text-xs text-sunu-ink/55">
        Avec le tiers payant, le patient ne règle que sa part ; vous facturez le reste à
        l'organisme.
      </p>
      <ul className="mt-3 space-y-1.5">
        {(insurers ?? []).map((i) => {
          const on = i.id in current;
          return (
            <li key={i.id} className="flex items-center justify-between gap-2 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => toggle(i.id)}
                  className="accent-sunu-green"
                />
                {i.name}
              </label>
              {on && (
                <label className="flex items-center gap-1 text-xs text-sunu-ink/60">
                  <input
                    type="checkbox"
                    checked={current[i.id]}
                    onChange={(e) => setDraft({ ...current, [i.id]: e.target.checked })}
                    className="accent-sunu-teal"
                  />
                  tiers payant
                </label>
              )}
            </li>
          );
        })}
      </ul>
      {draft && (
        <button
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="mt-3 w-full rounded-lg bg-sunu-green px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Enregistrer
        </button>
      )}
    </section>
  );
}
