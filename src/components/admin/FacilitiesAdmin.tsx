/** Administration : hôpitaux et centres de santé du ticket virtuel, personnel d'accueil et responsables. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Hospital, MonitorPlay, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createFacility, listAdminFacilities, updateFacility, type Facility } from "@/api/queues";

const KINDS: { value: Facility["kind"]; label: string }[] = [
  { value: "hopital", label: "Hôpital" },
  { value: "centre_sante", label: "Centre de santé" },
  { value: "poste_sante", label: "Poste de santé" },
  { value: "clinique", label: "Clinique" },
];

export function FacilitiesAdmin() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["admin-facilities"], queryFn: listAdminFacilities });
  const [adding, setAdding] = useState(false);
  const empty = {
    name: "",
    kind: "hopital" as Facility["kind"],
    city: "",
    district: "",
    address: "",
    phone: "",
  };
  const [form, setForm] = useState(empty);
  const [agent, setAgent] = useState<Record<string, { email: string; role: "agent" | "manager" }>>(
    {},
  );
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-facilities"] });
  const create = useMutation({
    mutationFn: () => createFacility(form),
    onSuccess: () => {
      toast.success("Établissement ajouté : rattachez son responsable d'accueil");
      setAdding(false);
      setForm(empty);
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const update = useMutation({
    mutationFn: (v: { id: string; data: Record<string, unknown> }) => updateFacility(v.id, v.data),
    onSuccess: () => {
      setAgent({});
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const field = "w-full rounded-lg border border-sunu-line bg-sunu-card px-3 py-2 text-sm";

  return (
    <section className="rounded-xl border border-sunu-line bg-sunu-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-bold text-sunu-dark">
          <Hospital className="size-5 text-sunu-green" /> Ticket virtuel : établissements (
          {data?.length ?? 0})
        </h2>
        <button
          onClick={() => setAdding((v) => !v)}
          className="flex items-center gap-1 rounded-lg bg-sunu-green px-3 py-1.5 text-xs font-semibold text-white"
        >
          <Plus className="size-3.5" /> Ajouter un établissement
        </button>
      </div>
      <p className="mt-1 text-xs text-sunu-ink/55">
        Le responsable d'accueil crée ensuite ses services (horaires, capacité) depuis son espace «
        Accueil ».
      </p>
      {adding && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
          className="mt-3 grid gap-2 rounded-lg bg-sunu-surface p-3 sm:grid-cols-2"
        >
          <input
            required
            minLength={2}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Nom (ex. Hôpital de Fann)"
            aria-label="Nom"
            className={field}
          />
          <select
            value={form.kind}
            onChange={(e) => setForm({ ...form, kind: e.target.value as Facility["kind"] })}
            aria-label="Type"
            className={field}
          >
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
          <input
            required
            minLength={2}
            value={form.city}
            onChange={(e) => setForm({ ...form, city: e.target.value })}
            placeholder="Ville"
            aria-label="Ville"
            className={field}
          />
          <input
            value={form.district}
            onChange={(e) => setForm({ ...form, district: e.target.value })}
            placeholder="Quartier"
            aria-label="Quartier"
            className={field}
          />
          <input
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            placeholder="Adresse"
            aria-label="Adresse"
            className={field}
          />
          <input
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            placeholder="Téléphone de l'accueil"
            aria-label="Téléphone"
            className={field}
          />
          <button
            disabled={create.isPending}
            className="rounded-lg bg-sunu-green px-4 py-2 text-xs font-semibold text-white disabled:opacity-50 sm:col-span-2"
          >
            Ajouter
          </button>
        </form>
      )}
      <div className="mt-3 max-h-[32rem] divide-y divide-sunu-line overflow-y-auto">
        {(data ?? []).map((f) => (
          <div key={f.id} className="py-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold text-sunu-dark">
                {f.name}{" "}
                <span className="text-xs font-normal text-sunu-ink/55">
                  · {f.kind_label} · {f.city} · {f.services.length} service(s)
                </span>
              </p>
              <span className="flex items-center gap-3 text-xs">
                <a
                  href={`/affichage/${f.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 font-semibold text-sunu-green"
                >
                  <MonitorPlay className="size-3.5" /> Écran
                </a>
                <label className="flex items-center gap-1 text-sunu-ink/60">
                  <input
                    type="checkbox"
                    checked={f.is_active}
                    onChange={(e) =>
                      update.mutate({ id: f.id, data: { is_active: e.target.checked } })
                    }
                  />
                  Actif
                </label>
              </span>
            </div>
            <ul className="mt-1 grid gap-1">
              {f.agents.map((a) => (
                <li key={a.id} className="flex items-center justify-between text-xs">
                  <span>
                    {a.full_name} · {a.email} ·{" "}
                    {a.role === "manager" ? "Responsable" : "Agent d'accueil"}
                  </span>
                  <button
                    onClick={() => update.mutate({ id: f.id, data: { remove_agent_id: a.id } })}
                    aria-label={`Retirer ${a.full_name}`}
                    className="text-sunu-ink/40 hover:text-red-600"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const a = agent[f.id];
                if (a?.email)
                  update.mutate({ id: f.id, data: { agent_email: a.email, role: a.role } });
              }}
              className="mt-2 flex flex-wrap gap-2"
            >
              <input
                type="email"
                value={agent[f.id]?.email ?? ""}
                onChange={(e) =>
                  setAgent({
                    ...agent,
                    [f.id]: { email: e.target.value, role: agent[f.id]?.role ?? "agent" },
                  })
                }
                placeholder="Email du compte à rattacher"
                aria-label={`Rattacher un compte à ${f.name}`}
                className="min-w-0 flex-1 rounded-lg border border-sunu-line px-2 py-1.5 text-xs"
              />
              <select
                value={agent[f.id]?.role ?? "agent"}
                onChange={(e) =>
                  setAgent({
                    ...agent,
                    [f.id]: {
                      email: agent[f.id]?.email ?? "",
                      role: e.target.value as "agent" | "manager",
                    },
                  })
                }
                aria-label="Rôle"
                className="rounded-lg border border-sunu-line px-2 py-1.5 text-xs"
              >
                <option value="agent">Agent d'accueil</option>
                <option value="manager">Responsable</option>
              </select>
              <button className="rounded-lg border border-sunu-line px-3 py-1.5 text-xs font-semibold text-sunu-green">
                Rattacher
              </button>
            </form>
          </div>
        ))}
      </div>
    </section>
  );
}
