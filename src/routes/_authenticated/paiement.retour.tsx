import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { CheckCircle2, Clock, Loader2, XCircle } from "lucide-react";
import { refreshPayment } from "@/api/payments";
import { FajmaMark } from "@/components/FajmaMark";

export const Route = createFileRoute("/_authenticated/paiement/retour")({
  // Lien abîmé ou ouvert sans paramètre : pas d'erreur technique, la page affiche « Paiement introuvable ».
  validateSearch: (s) =>
    z.object({ payment: z.string().uuid().optional().catch(undefined) }).parse(s),
  head: () => ({
    meta: [{ title: "Paiement — Fajma" }, { name: "robots", content: "noindex" }],
  }),
  component: PaymentReturnPage,
});

function PaymentReturnPage() {
  const { payment } = Route.useSearch();
  // PayDunya peut mettre quelques secondes à confirmer : on revérifie tant que c'est en attente.
  const { data, isLoading, error } = useQuery({
    queryKey: ["payment-status", payment],
    queryFn: () => refreshPayment({ data: { payment_id: payment! } }),
    enabled: Boolean(payment),
    refetchInterval: (q) =>
      q.state.data?.status === "pending" && q.state.dataUpdateCount < 10 ? 4000 : false,
  });

  return (
    <div className="grid min-h-screen place-items-center bg-sunu-surface px-4">
      <div className="w-full max-w-md rounded-2xl border border-sunu-line bg-sunu-card p-8 text-center shadow-sunu-card">
        <Link to="/" className="mx-auto flex w-fit items-center gap-2">
          <FajmaMark className="size-8" />
          <span className="text-xl font-bold text-sunu-green">Fajma</span>
        </Link>
        {!payment ? (
          <Result
            icon={XCircle}
            tone="text-red-600"
            title="Paiement introuvable"
            body="Ce lien de paiement est incomplet. Retrouvez vos rendez-vous et vos paiements dans votre espace."
          />
        ) : isLoading ? (
          <Loader2 className="mx-auto mt-8 size-10 animate-spin text-sunu-green" />
        ) : error ? (
          <Result
            icon={XCircle}
            tone="text-red-600"
            title="Paiement introuvable"
            body={(error as Error).message}
          />
        ) : data?.status === "paid" ? (
          <Result
            icon={CheckCircle2}
            tone="text-sunu-teal"
            title="Paiement confirmé"
            body={`${data.amount.toLocaleString("fr-FR")} FCFA · réf. ${data.reference}`}
          />
        ) : data?.status === "failed" ? (
          <Result
            icon={XCircle}
            tone="text-red-600"
            title="Paiement non abouti"
            body="Aucun montant n'a été débité. Vous pouvez réessayer depuis votre espace."
          />
        ) : (
          <Result
            icon={Clock}
            tone="text-amber-600"
            title="Paiement en cours de confirmation"
            body="Si vous avez validé le paiement sur votre téléphone, la confirmation arrive dans quelques instants."
          />
        )}
        <Link
          to="/mon-espace"
          className="mt-8 inline-block rounded-xl bg-sunu-green px-6 py-3 text-sm font-semibold text-white hover:bg-sunu-green/90"
        >
          Retour à mon espace
        </Link>
      </div>
    </div>
  );
}

function Result({
  icon: Icon,
  tone,
  title,
  body,
}: {
  icon: typeof Clock;
  tone: string;
  title: string;
  body: string;
}) {
  return (
    <div className="mt-8">
      <Icon className={`mx-auto size-12 ${tone}`} />
      <h1 className="mt-4 text-xl font-bold text-sunu-dark">{title}</h1>
      <p className="mt-2 text-sm text-sunu-ink/60">{body}</p>
    </div>
  );
}
