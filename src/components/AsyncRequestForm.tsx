/**
 * Fiche du médecin : demande d'avis écrit (sans rendez-vous ni vidéo) — symptômes, depuis quand, mesures,
 * jusqu'à 4 photos ; puis paiement en ligne (mobile money ou crédit santé offert par un proche).
 */
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Camera, Loader2, MessageSquareText, Send } from "lucide-react";
import { toast } from "sonner";
import { useMe } from "@/api/auth";
import { getAsyncOffer, sendAsyncRequest } from "@/api/econsult";
import { listCareLinks } from "@/api/family";
import { startPayment } from "@/api/payments";
import { fileToBase64 } from "@/lib/file-base64";

export function AsyncRequestForm({
  doctorId,
  doctorName,
}: {
  doctorId: string;
  doctorName: string;
}) {
  const { data: offer } = useQuery({
    queryKey: ["async-offer", doctorId],
    queryFn: () => getAsyncOffer(doctorId),
  });
  const { data: me } = useMe();
  const { data: links } = useQuery({
    queryKey: ["care-links"],
    queryFn: listCareLinks,
    enabled: Boolean(me),
  });
  const credit = (links ?? [])
    .filter((l) => l.role === "beneficiary" && l.status === "active")
    .reduce((m, l) => Math.max(m, l.balance), 0);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    reason: "",
    symptoms: "",
    since: "",
    temperature: "",
    current_treatments: "",
  });
  const [files, setFiles] = useState<File[]>([]);
  const [sent, setSent] = useState<{ appointment_id: string; amount: number } | null>(null);

  const send = useMutation({
    mutationFn: async () =>
      sendAsyncRequest({
        doctor_id: doctorId,
        ...form,
        temperature: form.temperature || undefined,
        photos: await Promise.all(
          files.map(async (f) => ({ file_name: f.name, content_base64: await fileToBase64(f) })),
        ),
      }),
    onSuccess: (r) => {
      if (r.status === "submitted") {
        toast.success("Demande envoyée au médecin.");
        setOpen(false);
      } else setSent({ appointment_id: r.appointment_id, amount: r.amount });
    },
    onError: (e) => toast.error(e.message),
  });
  const pay = useMutation({
    mutationFn: (method: "wave" | "orange_money" | "free_money" | "credit") =>
      startPayment({ data: { appointment_id: sent!.appointment_id, method } }),
    onSuccess: (r) => {
      if (r.kind === "redirect") window.location.assign(r.url);
      else {
        toast.success("Payé : votre demande est chez le médecin.");
        setSent(null);
        setOpen(false);
      }
    },
    onError: (e) => toast.error(e.message),
  });

  if (!offer) return null;
  const field = "w-full rounded-lg border border-sunu-line bg-sunu-card px-3 py-2 text-sm";
  return (
    <section className="mb-4 rounded-2xl border border-sunu-green/40 bg-sunu-card p-5">
      <h3 className="flex items-center gap-2 font-bold text-sunu-dark">
        <MessageSquareText className="size-5 text-sunu-green" /> Avis écrit sous{" "}
        {offer.response_hours} h · {offer.price.toLocaleString("fr-FR")} F
      </h3>
      <p className="mt-1 text-xs text-sunu-ink/60">
        Sans rendez-vous ni vidéo : décrivez vos symptômes, ajoutez des photos, {doctorName} vous
        répond par écrit (ordonnance si besoin). Pas de réponse à temps : remboursé.
      </p>
      {!open ? (
        <button
          onClick={() => (me ? setOpen(true) : (window.location.href = "/auth"))}
          className="mt-3 rounded-full bg-sunu-green px-4 py-2 text-sm font-semibold text-white"
        >
          Demander un avis écrit
        </button>
      ) : sent ? (
        <div className="mt-3 space-y-2">
          <p className="text-sm font-semibold">
            Payez {sent.amount.toLocaleString("fr-FR")} F pour envoyer la demande :
          </p>
          <div className="flex flex-wrap gap-2">
            {credit >= sent.amount && (
              <button
                onClick={() => pay.mutate("credit")}
                className="rounded-lg bg-sunu-green px-3 py-1.5 text-xs font-semibold text-white"
              >
                Crédit santé ({credit.toLocaleString("fr-FR")} F)
              </button>
            )}
            {(["wave", "orange_money", "free_money"] as const).map((m) => (
              <button
                key={m}
                onClick={() => pay.mutate(m)}
                className="rounded-lg border border-sunu-line px-3 py-1.5 text-xs font-semibold"
              >
                {m === "wave" ? "Wave" : m === "orange_money" ? "Orange Money" : "Free Money"}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send.mutate();
          }}
          className="mt-3 grid gap-2"
        >
          {offer.instructions && <p className="text-xs text-sunu-ink/60">{offer.instructions}</p>}
          <input
            required
            minLength={3}
            value={form.reason}
            onChange={(e) => setForm({ ...form, reason: e.target.value })}
            placeholder="Motif (ex. bouton sur le bras)"
            aria-label="Motif"
            className={field}
          />
          <textarea
            required
            minLength={10}
            rows={4}
            value={form.symptoms}
            onChange={(e) => setForm({ ...form, symptoms: e.target.value })}
            placeholder="Décrivez ce que vous ressentez"
            aria-label="Symptômes"
            className={field}
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              value={form.since}
              onChange={(e) => setForm({ ...form, since: e.target.value })}
              placeholder="Depuis quand ?"
              aria-label="Depuis quand"
              className={field}
            />
            <input
              value={form.temperature}
              onChange={(e) => setForm({ ...form, temperature: e.target.value })}
              placeholder="Température (°C)"
              aria-label="Température"
              inputMode="decimal"
              className={field}
            />
          </div>
          <input
            value={form.current_treatments}
            onChange={(e) => setForm({ ...form, current_treatments: e.target.value })}
            placeholder="Médicaments pris en ce moment"
            aria-label="Traitements en cours"
            className={field}
          />
          <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-sunu-green">
            <Camera className="size-4" /> Ajouter des photos ({files.length}/4)
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="hidden"
              onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 4))}
            />
          </label>
          <button
            disabled={send.isPending}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-sunu-green px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {send.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
            Continuer
          </button>
        </form>
      )}
    </section>
  );
}
