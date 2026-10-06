/** Administration : laboratoires partenaires et comptes de leur personnel. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { FlaskConical, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createLab, labMember, listAdminLabs } from "@/api/labs";
import { LabEditor } from "@/components/labs/LabEditor";

export function LabsAdmin() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["admin-labs"], queryFn: listAdminLabs });
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({
    name: "",
    city: "",
    district: "",
    address: "",
    phone: "",
    opening_hours: "",
  });
  const [emails, setEmails] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-labs"] });
  const create = useMutation({
    mutationFn: () => createLab(form),
    onSuccess: () => {
      toast.success("Laboratoire ajouté : rattachez maintenant son personnel");
      setAdding(false);
      setForm({ name: "", city: "", district: "", address: "", phone: "", opening_hours: "" });
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const member = useMutation({
    mutationFn: (v: { labId: string; email?: string; remove_member_id?: string }) =>
      labMember(v.labId, { email: v.email, remove_member_id: v.remove_member_id }),
    onSuccess: () => {
      setEmails({});
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const field = "w-full rounded-lg border border-sunu-line bg-sunu-card px-3 py-2 text-sm";
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });
  return (
    <section className="rounded-xl border border-sunu-line bg-sunu-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-bold text-sunu-dark">
          <FlaskConical className="size-5 text-sunu-green" /> Laboratoires et centres d'imagerie (
          {data?.length ?? 0})
        </h2>
        <button
          onClick={() => setAdding((v) => !v)}
          className="flex items-center gap-1 rounded-lg bg-sunu-green px-3 py-1.5 text-xs font-semibold text-white"
        >
          <Plus className="size-3.5" /> Ajouter un laboratoire
        </button>
      </div>
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
            onChange={set("name")}
            placeholder="Nom du laboratoire"
            aria-label="Nom"
            className={field}
          />
          <input
            required
            minLength={2}
            value={form.city}
            onChange={set("city")}
            placeholder="Ville"
            aria-label="Ville"
            className={field}
          />
          <input
            value={form.district}
            onChange={set("district")}
            placeholder="Quartier"
            aria-label="Quartier"
            className={field}
          />
          <input
            required
            minLength={3}
            value={form.address}
            onChange={set("address")}
            placeholder="Adresse"
            aria-label="Adresse"
            className={field}
          />
          <input
            value={form.phone}
            onChange={set("phone")}
            placeholder="Téléphone"
            aria-label="Téléphone"
            className={field}
          />
          <input
            value={form.opening_hours}
            onChange={set("opening_hours")}
            placeholder="Horaires (ex. lun.–sam. 7 h 30 – 18 h)"
            aria-label="Horaires"
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
      <div className="mt-3 max-h-[28rem] divide-y divide-sunu-line overflow-y-auto">
        {(data ?? []).map((lab) => (
          <div key={lab.id} className="py-3 text-sm">
            <p className="flex items-center justify-between gap-2 font-semibold text-sunu-dark">
              <span>
                {lab.name}
                <span className="ml-2 text-xs font-normal text-sunu-ink/55">
                  {lab.kind_label}
                  {lab.modality_labels.length ? ` : ${lab.modality_labels.join(", ")}` : ""}
                </span>
              </span>
              <button
                onClick={() => setEditing(editing === lab.id ? null : lab.id)}
                aria-label={`Modifier ${lab.name}`}
                className="text-sunu-ink/40 hover:text-sunu-green"
              >
                <Pencil className="size-3.5" />
              </button>
            </p>
            <p className="text-xs text-sunu-ink/60">
              {lab.address}, {lab.city}
              {lab.phone ? ` · ${lab.phone}` : ""}
              {lab.opening_hours ? ` · ${lab.opening_hours}` : ""}
            </p>
            {editing === lab.id && <LabEditor lab={lab} admin onDone={() => setEditing(null)} />}
            <ul className="mt-1 grid gap-1">
              {lab.members.map((m) => (
                <li key={m.id} className="flex items-center justify-between text-xs">
                  <span>
                    {m.full_name} · {m.email}
                  </span>
                  <button
                    onClick={() => member.mutate({ labId: lab.id, remove_member_id: m.id })}
                    aria-label={`Retirer ${m.full_name}`}
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
                member.mutate({ labId: lab.id, email: emails[lab.id] });
              }}
              className="mt-2 flex gap-2"
            >
              <input
                type="email"
                required
                value={emails[lab.id] ?? ""}
                onChange={(e) => setEmails({ ...emails, [lab.id]: e.target.value })}
                placeholder="Email d'un compte du laboratoire"
                aria-label={`Rattacher un compte à ${lab.name}`}
                className="min-w-0 flex-1 rounded-lg border border-sunu-line bg-sunu-card px-3 py-1.5 text-xs"
              />
              <button className="rounded-lg border border-sunu-line px-3 py-1.5 text-xs font-semibold">
                Rattacher
              </button>
            </form>
          </div>
        ))}
      </div>
    </section>
  );
}
