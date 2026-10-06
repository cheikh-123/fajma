/** Administration : habilitation des relais communautaires (badiénou gokh, agents de santé de quartier). */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Users } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/api/client";

type Agent = {
  id: string;
  full_name: string;
  email: string | null;
  organization: string;
  area: string;
  is_active: boolean;
  people: number;
  max_people: number;
};

export function CommunityAdmin() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["admin-community"],
    queryFn: () => api.get<Agent[]>("/admin/community-agents"),
  });
  const [f, setF] = useState({ email: "", organization: "", area: "" });
  const add = useMutation({
    mutationFn: () => api.post<Agent[]>("/admin/community-agents", f),
    onSuccess: () => {
      toast.success("Relais habilité");
      setF({ email: "", organization: "", area: "" });
      qc.invalidateQueries({ queryKey: ["admin-community"] });
    },
    onError: (e) => toast.error(e.message),
  });
  const toggle = useMutation({
    mutationFn: (a: Agent) =>
      api.post(`/admin/community-agents/${a.id}`, { is_active: !a.is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-community"] }),
  });
  const field = "rounded-lg border border-sunu-line bg-sunu-card px-3 py-2 text-sm";
  return (
    <section className="rounded-xl border border-sunu-line bg-sunu-card p-5">
      <h2 className="flex items-center gap-2 font-bold text-sunu-dark">
        <Users className="size-5 text-sunu-green" /> Relais communautaires ({data?.length ?? 0})
      </h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          add.mutate();
        }}
        className="mt-3 grid gap-2 sm:grid-cols-4"
      >
        <input
          required
          type="email"
          value={f.email}
          onChange={(e) => setF({ ...f, email: e.target.value })}
          placeholder="Email du compte"
          aria-label="Email"
          className={field}
        />
        <input
          required
          value={f.organization}
          onChange={(e) => setF({ ...f, organization: e.target.value })}
          placeholder="Structure (poste de santé, ONG…)"
          aria-label="Structure"
          className={field}
        />
        <input
          required
          value={f.area}
          onChange={(e) => setF({ ...f, area: e.target.value })}
          placeholder="Quartiers ou villages"
          aria-label="Zone"
          className={field}
        />
        <button className="rounded-lg bg-sunu-green px-3 py-2 text-sm font-semibold text-white">
          Habiliter
        </button>
      </form>
      <ul className="mt-3 divide-y divide-sunu-line text-sm">
        {(data ?? []).map((a) => (
          <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span>
              <b>{a.full_name}</b> · {a.organization} · {a.area} · {a.people}/{a.max_people}{" "}
              personnes
            </span>
            <button
              onClick={() => toggle.mutate(a)}
              className={`text-xs font-semibold ${a.is_active ? "text-red-600" : "text-sunu-green"}`}
            >
              {a.is_active ? "Suspendre" : "Réactiver"}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
