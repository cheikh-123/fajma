/** Administration : ajouter une officine, corriger ses informations, voir sa garde et ses pharmaciens. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pencil, Plus, Search, Store } from "lucide-react";
import { toast } from "sonner";
import { adminUpdatePharmacy, createPharmacy, listAdminPharmacies } from "@/api/pharmacy";
import type { EditablePharmacy } from "@/api/types";
import { DutyControl, PharmacyEditor } from "@/components/PharmacyEditor";

export function PharmaciesAdmin() {
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const { data } = useQuery({
    queryKey: ["admin-pharmacies", q.trim()],
    queryFn: () => listAdminPharmacies(q.trim()),
  });
  return (
    <section className="rounded-xl border border-sunu-line bg-sunu-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-bold text-sunu-dark">
          <Store className="size-5 text-sunu-green" /> Pharmacies ({data?.length ?? 0})
        </h2>
        <button
          onClick={() => setAdding((v) => !v)}
          className="flex items-center gap-1 rounded-lg bg-sunu-green px-3 py-1.5 text-xs font-semibold text-white"
        >
          <Plus className="size-3.5" /> Ajouter une pharmacie
        </button>
      </div>
      {adding && <AddPharmacyForm onDone={() => setAdding(false)} />}
      <label className="mt-3 flex items-center gap-2 rounded-lg border border-sunu-line px-3">
        <Search className="size-4 text-sunu-ink/40" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Nom, ville ou quartier"
          aria-label="Rechercher une pharmacie"
          className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none"
        />
      </label>
      <div className="mt-3 max-h-[28rem] divide-y divide-sunu-line overflow-y-auto">
        {(data ?? []).map((p) => (
          <PharmacyRow key={p.id} pharmacy={p} />
        ))}
      </div>
    </section>
  );
}

function PharmacyRow({ pharmacy }: { pharmacy: EditablePharmacy }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(pharmacy.name);
  const save = useMutation({
    mutationFn: (data: Parameters<typeof adminUpdatePharmacy>[1]) =>
      adminUpdatePharmacy(pharmacy.id, data),
    onSuccess: () => {
      toast.success("Pharmacie mise à jour");
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["admin-pharmacies"] });
      qc.invalidateQueries({ queryKey: ["pharmacies-all"] });
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <div className="py-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sunu-dark">
            {pharmacy.name}
            {pharmacy.is_on_duty && (
              <span className="ml-2 rounded-full bg-sunu-teal/15 px-2 py-0.5 text-[10px] font-bold text-sunu-teal">
                De garde
              </span>
            )}
          </p>
          <p className="text-xs text-sunu-ink/60">
            {pharmacy.address}
            {pharmacy.district ? `, ${pharmacy.district}` : ""} · {pharmacy.city}
            {pharmacy.phone ? ` · ${pharmacy.phone}` : ""} ·{" "}
            {pharmacy.members
              ? `${pharmacy.members} pharmacien(s) inscrit(s)`
              : "aucun pharmacien inscrit"}
          </p>
        </div>
        <button
          onClick={() => setEditing((v) => !v)}
          className="flex items-center gap-1 text-xs font-semibold text-sunu-green"
        >
          <Pencil className="size-3" /> {editing ? "Fermer" : "Modifier"}
        </button>
      </div>
      {editing && (
        <div className="mt-3 grid gap-3 rounded-lg bg-sunu-surface p-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate({ name });
            }}
            className="flex gap-2"
          >
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-label="Nom de la pharmacie"
              className="min-w-0 flex-1 rounded-lg border border-sunu-line bg-sunu-card px-3 py-2 text-sm"
            />
            <button className="rounded-lg border border-sunu-line px-3 py-2 text-xs font-semibold">
              Renommer
            </button>
          </form>
          <DutyControl pharmacy={pharmacy} saving={save.isPending} onSave={(d) => save.mutate(d)} />
          <PharmacyEditor
            pharmacy={pharmacy}
            saving={save.isPending}
            onSave={(d) => save.mutate(d)}
          />
        </div>
      )}
    </div>
  );
}

function AddPharmacyForm({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: "",
    city: "",
    district: "",
    address: "",
    phone: "",
    opens_at: "08:00",
    closes_at: "22:00",
    latitude: "",
    longitude: "",
  });
  const create = useMutation({
    mutationFn: () =>
      createPharmacy({
        ...form,
        latitude: form.latitude ? Number(form.latitude.replace(",", ".")) : undefined,
        longitude: form.longitude ? Number(form.longitude.replace(",", ".")) : undefined,
      }),
    onSuccess: (p) => {
      toast.success(`${p.name} ajoutée. Rattachez maintenant son pharmacien ci-dessous.`);
      qc.invalidateQueries({ queryKey: ["admin-pharmacies"] });
      qc.invalidateQueries({ queryKey: ["pharmacies-all"] });
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });
  const field = "w-full rounded-lg border border-sunu-line bg-sunu-card px-3 py-2 text-sm";
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });
  return (
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
        placeholder="Nom de la pharmacie"
        aria-label="Nom"
        className={field}
      />
      <input
        required
        minLength={2}
        value={form.city}
        onChange={set("city")}
        placeholder="Ville (ex. Dakar)"
        aria-label="Ville"
        className={field}
      />
      <input
        value={form.district}
        onChange={set("district")}
        placeholder="Quartier (ex. Médina)"
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
      <div className="grid grid-cols-2 gap-2">
        <input
          type="time"
          value={form.opens_at}
          onChange={set("opens_at")}
          aria-label="Ouverture"
          className={field}
        />
        <input
          type="time"
          value={form.closes_at}
          onChange={set("closes_at")}
          aria-label="Fermeture"
          className={field}
        />
      </div>
      <input
        value={form.latitude}
        onChange={set("latitude")}
        placeholder="Latitude GPS (facultatif)"
        aria-label="Latitude"
        className={field}
      />
      <input
        value={form.longitude}
        onChange={set("longitude")}
        placeholder="Longitude GPS (facultatif)"
        aria-label="Longitude"
        className={field}
      />
      <p className="text-[11px] text-sunu-ink/55 sm:col-span-2">
        Sans coordonnées GPS, la pharmacie est placée au centre de son quartier (ou de sa ville) sur
        la carte. Pour être précis : dans Google Maps, appui long sur l'officine, puis copiez les
        deux nombres.
      </p>
      <button
        disabled={create.isPending}
        className="rounded-lg bg-sunu-green px-4 py-2 text-xs font-semibold text-white disabled:opacity-50 sm:col-span-2"
      >
        Ajouter la pharmacie
      </button>
    </form>
  );
}
