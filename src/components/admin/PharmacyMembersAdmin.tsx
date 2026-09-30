/** Administration : rattacher un compte pharmacien vérifié à son officine. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pill, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { listPharmacies } from "@/api/directory";
import { addPharmacyMember, listPharmacyMembers, removePharmacyMember } from "@/api/pharmacy";

export function PharmacyMembersAdmin() {
  const qc = useQueryClient();
  const { data: members } = useQuery({
    queryKey: ["admin-pharmacy-members"],
    queryFn: listPharmacyMembers,
  });
  const { data: pharmacies } = useQuery({
    queryKey: ["pharmacies-all"],
    queryFn: () => listPharmacies(),
  });
  const [pharmacyId, setPharmacyId] = useState("");
  const [email, setEmail] = useState("");
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-pharmacy-members"] });
  const add = useMutation({
    mutationFn: () => addPharmacyMember({ data: { pharmacy_id: pharmacyId, email } }),
    onSuccess: () => {
      toast.success("Pharmacien rattaché");
      setEmail("");
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => removePharmacyMember(id),
    onSuccess: refresh,
    onError: (e) => toast.error(e.message),
  });

  return (
    <section className="rounded-xl border border-sunu-line bg-sunu-card p-5">
      <h2 className="flex items-center gap-2 font-bold text-sunu-dark">
        <Pill className="size-4" /> Pharmacies partenaires
      </h2>
      <p className="mt-1 text-xs text-sunu-ink/55">
        Vérifiez l'autorisation d'exercice avant de rattacher un compte : il verra les ordonnances
        envoyées à cette officine.
      </p>
      <form
        className="mt-3 flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add.mutate();
        }}
      >
        <select
          required
          aria-label="Pharmacie"
          value={pharmacyId}
          onChange={(e) => setPharmacyId(e.target.value)}
          className="min-w-52 flex-1 rounded-lg border border-sunu-line px-2 py-2 text-sm"
        >
          <option value="">Pharmacie…</option>
          {(pharmacies ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} — {p.city}
            </option>
          ))}
        </select>
        <input
          required
          type="email"
          aria-label="Email du pharmacien"
          placeholder="Email du compte pharmacien"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="min-w-52 flex-1 rounded-lg border border-sunu-line px-2 py-2 text-sm"
        />
        <button
          disabled={add.isPending}
          className="rounded-lg bg-sunu-night px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Rattacher
        </button>
      </form>
      <div className="mt-3 divide-y divide-sunu-line">
        {(members ?? []).map((m) => (
          <div key={m.id} className="flex items-center justify-between gap-2 py-2 text-sm">
            <span>
              <b className="text-sunu-dark">{m.pharmacy}</b> ({m.city}) · {m.user}{" "}
              {m.email && `<${m.email}>`}
            </span>
            <button
              onClick={() => remove.mutate(m.id)}
              aria-label="Retirer"
              className="text-sunu-ink/40 hover:text-red-600"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
