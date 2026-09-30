/** « Ce médicament est-il disponible ? » : le patient interroge jusqu'à 5 pharmacies partenaires, qui répondent. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { CheckCircle2, Clock, PackageSearch, XCircle } from "lucide-react";
import { toast } from "sonner";
import { askMedicine, listMyMedicineQueries, listReceivingPharmacies } from "@/api/pharmacy";
import { useMe } from "@/api/auth";
import { formatDateTime } from "@/lib/datetime";

export function MedicineAvailability() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [medicine, setMedicine] = useState("");
  const [note, setNote] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const { data: pharmacies } = useQuery({
    queryKey: ["receiving-pharmacies"],
    queryFn: listReceivingPharmacies,
    enabled: Boolean(me),
  });
  const { data: queries } = useQuery({
    queryKey: ["medicine-queries"],
    queryFn: listMyMedicineQueries,
    enabled: Boolean(me),
    refetchInterval: 60_000,
  });
  const ask = useMutation({
    mutationFn: () =>
      askMedicine({ medicine: medicine.trim(), note: note || undefined, pharmacy_ids: picked }),
    onSuccess: () => {
      toast.success("Demande envoyée : vous serez prévenu dès qu'une pharmacie répond");
      setMedicine("");
      setNote("");
      setPicked([]);
      qc.invalidateQueries({ queryKey: ["medicine-queries"] });
    },
    onError: (e) => toast.error(e.message),
  });
  const toggle = (id: string) =>
    setPicked(
      picked.includes(id)
        ? picked.filter((x) => x !== id)
        : picked.length < 5
          ? [...picked, id]
          : picked,
    );

  return (
    <section
      id="disponibilite"
      className="mt-10 scroll-mt-6 rounded-2xl border border-sunu-line bg-sunu-card p-5"
    >
      <h2 className="flex items-center gap-2 text-lg font-bold text-sunu-dark">
        <PackageSearch className="size-5 text-sunu-green" /> Ce médicament est-il disponible ?
      </h2>
      <p className="mt-1 text-sm text-sunu-ink/60">
        Demandez à des pharmacies partenaires si elles l'ont en stock, avant de vous déplacer. Elles
        répondent sous 24 h ; votre nom ne leur est pas transmis.
      </p>
      {!me ? (
        <Link to="/auth" className="mt-3 inline-block text-sm font-semibold text-sunu-green">
          Connectez-vous pour envoyer une demande →
        </Link>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!picked.length) return toast.error("Choisissez au moins une pharmacie");
            ask.mutate();
          }}
          className="mt-3 grid gap-2"
        >
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              required
              minLength={2}
              value={medicine}
              onChange={(e) => setMedicine(e.target.value)}
              placeholder="Médicament (ex. Coartem 80/480)"
              aria-label="Médicament recherché"
              className="rounded-lg border border-sunu-line bg-sunu-card px-3 py-2 text-sm"
            />
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={200}
              placeholder="Précision (quantité, générique accepté…)"
              aria-label="Précision"
              className="rounded-lg border border-sunu-line bg-sunu-card px-3 py-2 text-sm"
            />
          </div>
          <p className="text-xs font-semibold text-sunu-ink/60">
            Pharmacies à interroger ({picked.length}/5) :
          </p>
          <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
            {(pharmacies ?? []).length === 0 && (
              <p className="text-xs text-sunu-ink/50">
                Aucune pharmacie partenaire pour l'instant.
              </p>
            )}
            {(pharmacies ?? []).map((p) => (
              <button
                type="button"
                key={p.id}
                onClick={() => toggle(p.id)}
                aria-pressed={picked.includes(p.id)}
                className={`rounded-lg border px-2.5 py-1.5 text-xs ${picked.includes(p.id) ? "border-sunu-green bg-sunu-green text-white" : "border-sunu-line text-sunu-ink/70"}`}
              >
                {p.name} <span className="opacity-70">· {p.district ?? p.city}</span>
              </button>
            ))}
          </div>
          <button
            disabled={ask.isPending}
            className="justify-self-start rounded-lg bg-sunu-green px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
          >
            Envoyer la demande
          </button>
        </form>
      )}
      {(queries ?? []).length > 0 && (
        <div className="mt-5 grid gap-3 border-t border-sunu-line pt-4">
          {(queries ?? []).map((q) => (
            <div key={q.id} className="text-sm">
              <p className="font-semibold text-sunu-dark">
                {q.medicine}
                <span className="ml-2 text-xs font-normal text-sunu-ink/50">
                  {formatDateTime(q.created_at, {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  {q.expired ? " · terminée" : ""}
                </span>
              </p>
              <ul className="mt-1 grid gap-1">
                {q.answers.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center gap-2 text-xs">
                    {a.status === "available" ? (
                      <CheckCircle2 className="size-4 text-sunu-teal" />
                    ) : a.status === "unavailable" ? (
                      <XCircle className="size-4 text-red-600" />
                    ) : (
                      <Clock className="size-4 text-sunu-ink/40" />
                    )}
                    <b>{a.pharmacy.name}</b>
                    <span className="text-sunu-ink/60">
                      {a.status === "available"
                        ? `disponible${a.price ? ` · ${a.price.toLocaleString("fr-FR")} F` : ""}`
                        : a.status === "unavailable"
                          ? "indisponible"
                          : q.expired
                            ? "pas de réponse"
                            : "en attente de réponse"}
                      {a.note ? ` · ${a.note}` : ""}
                    </span>
                    {a.status === "available" && (
                      <a
                        href={`https://www.google.com/maps/dir/?api=1&destination=${a.pharmacy.latitude},${a.pharmacy.longitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold text-sunu-green"
                      >
                        Itinéraire
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
