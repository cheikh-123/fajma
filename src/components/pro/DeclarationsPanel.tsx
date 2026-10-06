/** Médecin : cas de maladies à déclaration immédiate à déclarer au district sanitaire (n'apparaît que s'il y en a). */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/api/client";

type Declaration = {
  id: string;
  condition: string;
  status: string;
  date: string;
  declared_at: string | null;
  reference: string | null;
};

export function DeclarationsPanel() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["pro-declarations"],
    queryFn: () => api.get<Declaration[]>("/pro/declarations"),
  });
  const declare = useMutation({
    mutationFn: (v: { id: string; reference: string }) =>
      api.post(`/pro/declarations/${v.id}`, { reference: v.reference }),
    onSuccess: () => {
      toast.success("Déclaration enregistrée. Merci.");
      qc.invalidateQueries({ queryKey: ["pro-declarations"] });
    },
    onError: (e) => toast.error(e.message),
  });
  const todo = (data ?? []).filter((d) => !d.declared_at);
  if (!todo.length) return null;
  return (
    <section className="mt-6 rounded-2xl border border-red-300 bg-red-50 p-4 text-sm text-red-900">
      <h2 className="flex items-center gap-2 font-bold">
        <AlertTriangle className="size-5" /> Déclarations à faire au district sanitaire (
        {todo.length})
      </h2>
      <ul className="mt-2 space-y-2">
        {todo.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center justify-between gap-2">
            <span>
              <b>{d.condition}</b> · {d.status} · {new Date(d.date).toLocaleDateString("fr-FR")}
            </span>
            <button
              onClick={() => {
                const reference = window.prompt(
                  "Déclaré à qui ? (district, nom de la personne, numéro de déclaration)",
                );
                if (reference !== null) declare.mutate({ id: d.id, reference });
              }}
              className="rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white"
            >
              J'ai déclaré ce cas
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
