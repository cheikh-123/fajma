/** Sous une ordonnance du patient : l'envoyer à une pharmacie partenaire et suivre sa préparation. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Loader2, Send, Store, X } from "lucide-react";
import { toast } from "sonner";
import {
  cancelOrder,
  listMyOrders,
  listReceivingPharmacies,
  OPEN_STATUSES,
  sendPrescription,
  type OrderStatus,
} from "@/api/pharmacy";

const STATUS_CLS: Record<OrderStatus, string> = {
  sent: "bg-sunu-green-soft text-sunu-green",
  preparing: "bg-amber-100 text-amber-800",
  ready: "bg-sunu-teal/15 text-sunu-teal",
  unavailable: "bg-red-100 text-red-700",
  collected: "bg-sunu-surface text-sunu-ink/60",
  cancelled: "bg-sunu-surface text-sunu-ink/60",
};

export function PharmacyOrderBox({ prescriptionId }: { prescriptionId: string }) {
  const qc = useQueryClient();
  const { data: orders } = useQuery({ queryKey: ["pharmacy-orders"], queryFn: listMyOrders });
  const [open, setOpen] = useState(false);
  const order = orders?.find((o) => o.prescription.id === prescriptionId);
  const refresh = () => qc.invalidateQueries({ queryKey: ["pharmacy-orders"] });
  const cancel = useMutation({
    mutationFn: (id: string) => cancelOrder(id),
    onSuccess: () => {
      toast.success("Demande annulée");
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });

  if (order && OPEN_STATUSES.includes(order.status)) {
    return (
      <div className="mt-3 rounded-lg bg-sunu-surface px-3 py-2 text-xs">
        <p className="flex flex-wrap items-center gap-2">
          <Store className="size-3.5 text-sunu-ink/50" />
          <span className="font-semibold text-sunu-dark">{order.pharmacy.name}</span>
          <span className={`rounded-full px-2 py-0.5 font-semibold ${STATUS_CLS[order.status]}`}>
            {order.status_label}
          </span>
        </p>
        {order.status === "ready" && (
          <p className="mt-1 text-sunu-ink/70">
            À retirer : {order.pharmacy.address}, {order.pharmacy.city}
            {order.total_price != null && ` · ${order.total_price.toLocaleString("fr-FR")} F`}
            {order.pharmacy.phone && ` · ${order.pharmacy.phone}`}
          </p>
        )}
        {order.pharmacy_note && <p className="mt-1 text-sunu-ink/70">« {order.pharmacy_note} »</p>}
        {order.status === "sent" && (
          <button
            onClick={() => cancel.mutate(order.id)}
            disabled={cancel.isPending}
            className="mt-1 inline-flex items-center gap-1 font-semibold text-red-600 hover:underline"
          >
            <X className="size-3" /> Annuler la demande
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="mt-3">
      {order && (
        <p className="mb-1 text-[11px] text-sunu-ink/55">
          Dernière demande : {order.pharmacy.name} — {order.status_label}
          {order.pharmacy_note && ` (« ${order.pharmacy_note} »)`}
        </p>
      )}
      {open ? (
        <Picker
          prescriptionId={prescriptionId}
          onDone={() => {
            setOpen(false);
            refresh();
          }}
          onClose={() => setOpen(false)}
        />
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-sunu-teal px-3 py-1.5 text-xs font-semibold text-sunu-teal hover:bg-sunu-teal hover:text-white"
        >
          <Send className="size-3.5" /> Envoyer à une pharmacie
        </button>
      )}
    </div>
  );
}

function Picker({
  prescriptionId,
  onDone,
  onClose,
}: {
  prescriptionId: string;
  onDone: () => void;
  onClose: () => void;
}) {
  const { data: pharmacies, isLoading } = useQuery({
    queryKey: ["receiving-pharmacies"],
    queryFn: listReceivingPharmacies,
  });
  const cities = useMemo(() => [...new Set((pharmacies ?? []).map((p) => p.city))], [pharmacies]);
  const [city, setCity] = useState("");
  const [pharmacyId, setPharmacyId] = useState("");
  const [note, setNote] = useState("");
  const shown = (pharmacies ?? []).filter((p) => !city || p.city === city);
  const send = useMutation({
    mutationFn: () =>
      sendPrescription({
        data: { prescription_id: prescriptionId, pharmacy_id: pharmacyId, note },
      }),
    onSuccess: (o) => {
      toast.success(
        `Ordonnance envoyée à ${o.pharmacy.name}. Vous serez prévenu quand elle sera prête.`,
      );
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) return <Loader2 className="size-4 animate-spin text-sunu-ink/50" />;
  if (!pharmacies?.length) {
    return (
      <p className="text-xs text-sunu-ink/55">
        Aucune pharmacie ne reçoit encore les ordonnances en ligne.
      </p>
    );
  }
  return (
    <form
      className="space-y-2 rounded-lg border border-sunu-line p-3"
      onSubmit={(e) => {
        e.preventDefault();
        send.mutate();
      }}
    >
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs font-semibold text-sunu-ink/70">
          Ville
          <select
            value={city}
            onChange={(e) => {
              setCity(e.target.value);
              setPharmacyId("");
            }}
            className="mt-1 w-full rounded-lg border border-sunu-line px-2 py-1.5 text-sm"
          >
            <option value="">Toutes</option>
            {cities.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold text-sunu-ink/70">
          Pharmacie
          <select
            required
            value={pharmacyId}
            onChange={(e) => setPharmacyId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-sunu-line px-2 py-1.5 text-sm"
          >
            <option value="">Choisir…</option>
            {shown.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {p.district ?? p.city}
                {p.is_on_duty ? " (de garde)" : ""}
              </option>
            ))}
          </select>
        </label>
      </div>
      <input
        value={note}
        maxLength={300}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Message pour la pharmacie (facultatif)"
        className="w-full rounded-lg border border-sunu-line px-2 py-1.5 text-sm"
      />
      <p className="text-[11px] text-sunu-ink/50">
        La pharmacie verra le contenu de cette ordonnance, votre nom et votre téléphone. Cet accès
        apparaît dans votre journal d'accès.
      </p>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={send.isPending || !pharmacyId}
          className="flex items-center gap-1.5 rounded-lg bg-sunu-teal px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          {send.isPending && <Loader2 className="size-3.5 animate-spin" />} Envoyer
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-sunu-line px-3 py-1.5 text-xs"
        >
          Annuler
        </button>
      </div>
    </form>
  );
}
