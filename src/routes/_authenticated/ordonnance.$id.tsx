import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { ThemeToggle } from "@/lib/theme";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { ArrowLeft, FileDown, Heart, Printer } from "lucide-react";
import { getMyPrescription } from "@/api/documents";
import { usePrescriptionPdf } from "@/hooks/use-prescription-pdf";
import { formatDate } from "@/lib/datetime";
import { drName, patientLine, renewalText } from "@/lib/prescription-text";

const prescriptionQO = (id: string) =>
  queryOptions({
    queryKey: ["prescription", id],
    queryFn: () => getMyPrescription({ data: { id } }),
  });

export const Route = createFileRoute("/_authenticated/ordonnance/$id")({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(prescriptionQO(params.id)),
  head: () => ({
    meta: [
      { title: "Ordonnance — Fajma" },
      {
        name: "description",
        content: "Ordonnance médicale électronique à imprimer ou présenter en pharmacie.",
      },
      { property: "og:title", content: "Ordonnance — Fajma" },
      { property: "og:description", content: "Ordonnance médicale électronique Fajma." },
      { name: "robots", content: "noindex" },
    ],
  }),
  errorComponent: () => (
    <div className="grid min-h-screen place-items-center bg-sunu-surface p-6 text-center">
      <div>
        <p className="text-lg font-bold text-sunu-dark">Ordonnance indisponible</p>
        <Link to="/dossier" className="mt-3 inline-block text-sm font-semibold text-sunu-green">
          Retour au dossier
        </Link>
      </div>
    </div>
  ),
  notFoundComponent: () => <p className="p-10 text-center text-sm">Ordonnance introuvable.</p>,
  component: PrescriptionPage,
});

function PrescriptionPage() {
  const { id } = Route.useParams();
  const { data } = useSuspenseQuery(prescriptionQO(id));
  const pdf = usePrescriptionPdf();
  const router = useRouter();
  const date = formatDate(data.created_at, { day: "2-digit", month: "long", year: "numeric" });
  const issuer = data.issuer;
  return (
    <div className="min-h-screen bg-sunu-surface print:bg-sunu-card">
      <header className="border-b border-sunu-line bg-sunu-card print:hidden">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4 sm:px-6">
          {/* Patient (depuis son dossier) ou médecin (depuis la fiche patient) : retour à la page précédente. */}
          <button
            type="button"
            onClick={() =>
              window.history.length > 1
                ? router.history.back()
                : router.navigate({ to: "/dossier" })
            }
            className="flex items-center gap-1 text-sm font-semibold text-sunu-ink/60"
          >
            <ArrowLeft className="size-4" /> Retour
          </button>
          <ThemeToggle className="ml-auto mr-3" />
          <div className="flex gap-2">
            <button
              onClick={() => window.print()}
              aria-label="Imprimer"
              className="flex items-center gap-2 rounded-lg border border-sunu-line px-4 py-2 text-sm font-semibold text-sunu-green"
            >
              <Printer className="size-4" /> <span className="hidden sm:inline">Imprimer</span>
            </button>
            <button
              onClick={() => pdf.mutate(id)}
              aria-label="Télécharger le PDF"
              disabled={pdf.isPending}
              className="flex items-center gap-2 rounded-lg bg-sunu-green px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              <FileDown className="size-4" /> {pdf.isPending ? "Génération…" : "PDF"}
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 print:px-0 print:py-0">
        <article className="rounded-xl border border-sunu-line bg-sunu-card p-5 sm:p-8 print:rounded-none print:border-0 print:p-0">
          <div className="mb-4 flex justify-end">
            <span className="flex items-center gap-2" aria-label="Fajma">
              <span className="grid size-8 place-items-center rounded-lg bg-sunu-green text-white">
                <Heart className="size-4" strokeWidth={2.5} />
              </span>
              <span className="text-lg font-bold text-sunu-green">Fajma</span>
            </span>
          </div>
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-sunu-line pb-5">
            <div className="text-xs text-sunu-ink/60">
              <p className="text-base font-bold text-sunu-dark">{drName(issuer.full_name)}</p>
              {issuer.specialty && (
                <p className="font-semibold text-sunu-green">{issuer.specialty}</p>
              )}
              {issuer.title && <p>{issuer.title}</p>}
              {issuer.order_number && (
                <p className="text-sunu-dark">
                  N° d'inscription à l'Ordre des médecins : {issuer.order_number}
                </p>
              )}
              {issuer.replacing && (
                <p className="font-semibold text-sunu-dark">
                  Remplaçant du {drName(issuer.replacing)}
                </p>
              )}
            </div>
            <div className="text-xs text-sunu-ink/60 sm:text-right">
              {issuer.practice_name && (
                <p className="text-sm font-bold text-sunu-dark">{issuer.practice_name}</p>
              )}
              {issuer.address && <p>{issuer.address}</p>}
              {issuer.city && <p>{issuer.city}</p>}
              {issuer.phone && <p>Tél. : {issuer.phone}</p>}
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-baseline justify-between gap-2">
            <h1 className="text-xl font-bold tracking-wide text-sunu-green">ORDONNANCE</h1>
            <p className="text-xs text-sunu-ink/60 sm:text-right">
              <span className="font-semibold text-sunu-dark">Réf. {data.reference ?? ""}</span>
              <br />
              Délivrée le {date}
            </p>
          </div>

          <div className="mt-4 rounded-lg bg-sunu-surface p-4 text-sm print:border print:border-sunu-line print:bg-transparent">
            <p className="text-[10px] font-bold uppercase tracking-widest text-sunu-green">
              Patient
            </p>
            <p className="mt-1 font-semibold text-sunu-dark">{data.patient?.full_name ?? "—"}</p>
            {data.patient && patientLine(data.patient, data.created_at) && (
              <p className="text-xs text-sunu-ink/60">
                {patientLine(data.patient, data.created_at)}
              </p>
            )}
            {data.patient?.account_holder && (
              <p className="text-xs text-sunu-ink/50 print:hidden">
                Compte de {data.patient.account_holder}
              </p>
            )}
          </div>

          <div className="mt-6">
            {data.items.length ? (
              <ol className="space-y-4">
                {data.items.map((it, i) => (
                  <li key={i} className="text-sm">
                    <p className="font-bold text-sunu-dark">
                      {i + 1}. {[it.name, it.dosage].filter(Boolean).join(" ")}
                      {it.non_substitutable && (
                        <span className="ml-2 rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-bold text-red-700">
                          NON SUBSTITUABLE
                        </span>
                      )}
                    </p>
                    <p className="ml-5 text-sunu-dark">{it.posology}</p>
                    {(it.duration || it.quantity) && (
                      <p className="ml-5 text-xs text-sunu-ink/60">
                        {[
                          it.duration && `Durée : ${it.duration}`,
                          it.quantity && `Quantité : ${it.quantity}`,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-sunu-dark">
                {data.content}
              </p>
            )}
            <div className="mt-5 flex flex-wrap justify-between gap-2 border-t border-sunu-line pt-3 text-xs font-semibold text-sunu-dark">
              <span>{renewalText(data.renewals)}</span>
              {data.valid_until && <span>Valable jusqu'au {formatDate(data.valid_until)}</span>}
            </div>
            {data.instructions && (
              <p className="mt-4 rounded-lg bg-sunu-surface p-3 text-xs text-sunu-ink/70 print:bg-transparent print:p-0">
                <strong>Conseils :</strong> {data.instructions}
              </p>
            )}
          </div>

          <div className="mt-10 flex flex-wrap items-end justify-between gap-6 border-t border-sunu-line pt-5">
            <div className="text-xs text-sunu-ink/50">
              <p>Vérifiez l'authenticité sur</p>
              <p className="font-semibold text-sunu-green">{data.verify_url}</p>
            </div>
            <div className="text-xs text-sunu-ink/60">
              <p>
                Fait à {issuer.city}, le {date}
              </p>
              <p className="mt-1 font-semibold text-sunu-green">Signature et cachet du médecin</p>
              <div
                className="mt-2 flex h-24 max-w-full items-center gap-2 overflow-hidden rounded-lg px-2"
                style={{ background: "#fff" }}
              >
                {issuer.stamp && (
                  <img
                    src={issuer.stamp}
                    alt="Cachet"
                    className="h-20 w-auto min-w-0 object-contain"
                  />
                )}
                {issuer.signature ? (
                  <img
                    src={issuer.signature}
                    alt="Signature"
                    className="h-16 w-auto min-w-0 max-w-full object-contain object-left"
                  />
                ) : (
                  <span className="text-lg italic text-gray-700">{drName(issuer.full_name)}</span>
                )}
              </div>
            </div>
          </div>
          <div className="mt-6 border-t border-sunu-line pt-4">
            <p className="text-[10px] leading-relaxed text-sunu-ink/45">
              Ordonnance électronique délivrée via Fajma. À présenter en pharmacie avec une pièce
              d'identité. Toute modification rend l'ordonnance invalide.
            </p>
          </div>
        </article>
      </main>
    </div>
  );
}
