import { createFileRoute, Link } from "@tanstack/react-router";
import { ThemeToggle } from "@/lib/theme";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Check, Loader2, PackageCheck, Pill, Store, X } from "lucide-react";
import { toast } from "sonner";
import {
  getMyPharmacies,
  getPharmacyDashboard,
  OPEN_STATUSES,
  updateMyPharmacy,
  updateOrder,
  type PharmacyOrder,
  type PharmacyUpdate,
} from "@/api/pharmacy";
import type { EditablePharmacy } from "@/api/types";
import { NotificationBell } from "@/components/NotificationBell";
import { LogoutButton } from "@/components/LogoutButton";
import { DutyControl, PharmacyEditor } from "@/components/PharmacyEditor";
import { WEEK } from "@/lib/weekdays";
import { SecuritySection } from "@/components/SecuritySection";
import { MedicineQuestions } from "@/components/pharmacy/MedicineQuestions";
import { formatDate, formatDateTime } from "@/lib/datetime";
import { ageAt } from "@/lib/prescription-text";

export const Route = createFileRoute("/_authenticated/pharmacie")({
  head: () => ({
    meta: [{ title: "Espace pharmacie — Fajma" }, { name: "robots", content: "noindex" }],
  }),
  component: PharmacyPage,
});

const COLUMNS: { status: PharmacyOrder["status"]; title: string }[] = [
  { status: "sent", title: "Reçues" },
  { status: "preparing", title: "En préparation" },
  { status: "ready", title: "Prêtes à retirer" },
];

function PharmacyPage() {
  // Rafraîchissement régulier : les nouvelles ordonnances apparaissent sans recharger la page.
  const { data, error, isLoading } = useQuery({
    queryKey: ["pharmacy-dashboard"],
    queryFn: getPharmacyDashboard,
    refetchInterval: 30_000,
  });
  if (isLoading) return <Loader2 className="m-10 size-6 animate-spin text-sunu-ink/40" />;
  if (error || !data) {
    return (
      <div className="mx-auto max-w-lg px-6 py-16 text-center">
        <Store className="mx-auto size-10 text-sunu-ink/30" />
        <h1 className="mt-4 text-xl font-bold text-sunu-dark">
          Espace réservé aux pharmacies partenaires
        </h1>
        <p className="mt-2 text-sm text-sunu-ink/60">
          Votre compte n'est pas encore rattaché à une officine. Contactez l'équipe Fajma avec votre
          numéro d'autorisation d'exercice pour être vérifié.
        </p>
        <Link to="/" className="mt-6 inline-block text-sm font-semibold text-sunu-green">
          Retour à l'accueil
        </Link>
      </div>
    );
  }
  const closed = data.orders.filter((o) => !OPEN_STATUSES.includes(o.status));
  return (
    <div className="min-h-screen bg-sunu-surface">
      <header className="border-b border-sunu-line bg-sunu-card">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <Link to="/" className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-lg bg-sunu-teal text-white">
              <Pill className="size-4" />
            </span>
            <span className="font-bold text-sunu-dark">
              {data.pharmacies.map((p) => p.name).join(" · ")}
            </span>
          </Link>
          <ThemeToggle className="ml-auto mr-3" />
          <NotificationBell />
          <LogoutButton />
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-8">
        <MyPharmacies />
        <MedicineQuestions questions={data.medicine_questions ?? []} />
        <h1 className="mt-8 text-2xl font-bold text-sunu-dark">Ordonnances reçues</h1>
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {COLUMNS.map((col) => {
            const items = data.orders.filter((o) => o.status === col.status);
            return (
              <section
                key={col.status}
                aria-label={col.title}
                className="rounded-2xl border border-sunu-line bg-sunu-card p-4"
              >
                <h2 className="text-xs font-bold uppercase tracking-wider text-sunu-ink/50">
                  {col.title} ({items.length})
                </h2>
                <div className="mt-3 space-y-3">
                  {items.length === 0 && (
                    <p className="py-6 text-center text-sm text-sunu-ink/40">Aucune</p>
                  )}
                  {items.map((o) => (
                    <OrderCard key={o.id} order={o} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
        {closed.length > 0 && (
          <section className="mt-6 rounded-2xl border border-sunu-line bg-sunu-card p-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-sunu-ink/50">
              Historique
            </h2>
            <div className="mt-2 divide-y divide-sunu-line text-sm">
              {closed.map((o) => (
                <p key={o.id} className="flex justify-between gap-2 py-2">
                  <span>
                    Réf. {o.prescription.reference} · Dr{" "}
                    {o.prescription.doctor_name.replace(/^Dr\.? /, "")}
                  </span>
                  <span className="text-sunu-ink/55">
                    {o.status_label} ·{" "}
                    {formatDateTime(o.updated_at, { dateStyle: "short", timeStyle: "short" })}
                  </span>
                </p>
              ))}
            </div>
          </section>
        )}
        <div className="mt-10">
          <SecuritySection />
        </div>
      </main>
    </div>
  );
}

/** Mon officine : garde, horaires, jours d'ouverture et coordonnées affichés aux patients. */
function MyPharmacies() {
  const { data } = useQuery({ queryKey: ["my-pharmacies"], queryFn: getMyPharmacies });
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {(data ?? []).map((p) => (
        <PharmacyCard key={p.id} pharmacy={p} />
      ))}
    </div>
  );
}

function PharmacyCard({ pharmacy }: { pharmacy: EditablePharmacy }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const save = useMutation({
    mutationFn: (data: PharmacyUpdate) => updateMyPharmacy({ pharmacy_id: pharmacy.id, ...data }),
    onSuccess: (res) => {
      qc.setQueryData(["my-pharmacies"], res);
      toast.success("Informations mises à jour : les patients les voient déjà.");
      setEditing(false);
    },
    onError: (e) => toast.error(e.message),
  });
  const days = pharmacy.open_days ?? [];
  return (
    <section
      aria-label={pharmacy.name}
      className="rounded-2xl border border-sunu-line bg-sunu-card p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-sunu-ink/50">
            Mon officine
          </p>
          <h2 className="font-bold text-sunu-dark">{pharmacy.name}</h2>
          <p className="text-xs text-sunu-ink/60">
            {pharmacy.address}
            {pharmacy.district ? `, ${pharmacy.district}` : ""} · {pharmacy.city}
            {pharmacy.phone ? ` · ${pharmacy.phone}` : ""}
          </p>
          <p className="mt-1 text-xs text-sunu-ink/60">
            {pharmacy.opens_at.slice(0, 5)} – {pharmacy.closes_at.slice(0, 5)} ·{" "}
            {WEEK.filter((w) => days.includes(w.day))
              .map((w) => w.label)
              .join(", ")}
          </p>
        </div>
        {!editing && (
          <button
            onClick={() => setEditing(true)}
            className="text-xs font-semibold text-sunu-green hover:underline"
          >
            Modifier horaires et coordonnées
          </button>
        )}
      </div>
      <div className="mt-3">
        <DutyControl pharmacy={pharmacy} saving={save.isPending} onSave={(d) => save.mutate(d)} />
      </div>
      {editing && (
        <div className="mt-4 border-t border-sunu-line pt-4">
          <PharmacyEditor
            pharmacy={pharmacy}
            saving={save.isPending}
            onSave={(d) => save.mutate(d)}
            onCancel={() => setEditing(false)}
          />
        </div>
      )}
      <p className="mt-3 text-[11px] text-sunu-ink/50">
        Nom ou ville à corriger : écrivez à l'équipe Fajma.
      </p>
    </section>
  );
}

function OrderCard({ order }: { order: PharmacyOrder }) {
  const qc = useQueryClient();
  const [price, setPrice] = useState(order.total_price?.toString() ?? "");
  const p = order.prescription;
  const patientMeta = [
    p.patient_birth_date && ageAt(p.patient_birth_date, p.created_at),
    p.patient_sex && (p.patient_sex === "F" ? "F" : "M"),
    p.patient_weight_kg && `${String(p.patient_weight_kg).replace(".", ",")} kg`,
  ]
    .filter(Boolean)
    .join(" · ");
  const update = useMutation({
    mutationFn: (v: {
      status: "preparing" | "ready" | "unavailable" | "collected";
      note?: string;
    }) =>
      updateOrder({ data: { id: order.id, ...v, total_price: price ? Number(price) : undefined } }),
    onSuccess: (o) => {
      toast.success(`Ordonnance ${p.reference} : ${o.status_label.toLowerCase()}`);
      qc.invalidateQueries({ queryKey: ["pharmacy-dashboard"] });
    },
    onError: (e) => toast.error(e.message),
  });
  const btn =
    "flex items-center justify-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50";

  return (
    <article className="rounded-xl border border-sunu-line p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-sunu-dark">{p.patient_name}</p>
          {patientMeta && <p className="text-xs text-sunu-ink/70">{patientMeta}</p>}
          <p className="text-xs text-sunu-ink/55">
            {p.account_holder && `Compte de ${p.account_holder} · `}
            {p.patient_phone ?? "—"} · reçue le{" "}
            {formatDateTime(order.created_at, { dateStyle: "short", timeStyle: "short" })}
          </p>
        </div>
        <span className="text-[10px] font-semibold uppercase text-sunu-ink/45">{p.reference}</span>
      </div>
      {p.items?.length ? (
        <ol className="mt-2 space-y-1.5 rounded-lg bg-sunu-surface p-2 text-sm text-sunu-dark">
          {p.items.map((it, i) => (
            <li key={i}>
              <b>
                {i + 1}. {[it.name, it.dosage].filter(Boolean).join(" ")}
              </b>
              {it.non_substitutable && (
                <span className="ml-1 text-[10px] font-bold text-red-700">NON SUBSTITUABLE</span>
              )}
              <span className="block text-xs text-sunu-ink/70">
                {[
                  it.posology,
                  it.duration && `pendant ${it.duration}`,
                  it.quantity && `qté : ${it.quantity}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-2 whitespace-pre-wrap rounded-lg bg-sunu-surface p-2 text-sm text-sunu-dark">
          {p.content}
        </p>
      )}
      {p.instructions && <p className="mt-1 text-xs text-sunu-ink/60">{p.instructions}</p>}
      <p className="mt-1 text-[11px] text-sunu-ink/50">
        Prescrit par {p.doctor_name}
        {p.doctor_order_number && ` (Ordre n° ${p.doctor_order_number})`}
        {p.replacing && `, remplaçant de ${p.replacing},`} le {formatDate(p.created_at)}
        {p.valid_until && ` · valable jusqu'au ${formatDate(p.valid_until)}`}
      </p>
      {p.max_dispensings != null && (
        <p
          className={`mt-1 text-[11px] font-semibold ${p.dispensed! + 1 >= p.max_dispensings ? "text-amber-800" : "text-sunu-ink/60"}`}
        >
          Délivrance {p.dispensed! + 1} sur {p.max_dispensings}
          {p.dispensed! + 1 >= p.max_dispensings && " — dernière délivrance autorisée"}
        </p>
      )}
      {order.patient_note && (
        <p className="mt-1 text-xs text-sunu-green">Patient : « {order.patient_note} »</p>
      )}

      {order.status !== "ready" && (
        <label className="mt-2 block text-[11px] font-semibold text-sunu-ink/60">
          Montant à régler (FCFA, facultatif)
          <input
            type="number"
            min={0}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="mt-0.5 w-full rounded-lg border border-sunu-line px-2 py-1 text-sm"
          />
        </label>
      )}
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        {order.status === "sent" && (
          <button
            disabled={update.isPending}
            onClick={() => update.mutate({ status: "preparing" })}
            className={`${btn} bg-amber-100 text-amber-800`}
          >
            Préparer
          </button>
        )}
        {(order.status === "sent" || order.status === "preparing") && (
          <>
            <button
              disabled={update.isPending}
              onClick={() => update.mutate({ status: "ready" })}
              className={`${btn} bg-sunu-teal text-white`}
            >
              <Check className="size-3.5" /> Prête
            </button>
            <button
              disabled={update.isPending}
              onClick={() => {
                const note = window.prompt("Que manque-t-il ? (message envoyé au patient par SMS)");
                if (note) update.mutate({ status: "unavailable", note });
              }}
              className={`${btn} bg-red-50 text-red-700`}
            >
              <X className="size-3.5" /> Indisponible
            </button>
          </>
        )}
        {order.status === "ready" && (
          <button
            disabled={update.isPending}
            onClick={() => update.mutate({ status: "collected" })}
            className={`${btn} col-span-2 bg-sunu-green text-white`}
          >
            <PackageCheck className="size-3.5" /> Retirée par le patient
          </button>
        )}
      </div>
    </article>
  );
}
