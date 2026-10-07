import { createFileRoute, Link } from "@tanstack/react-router";
import { BackButton } from "@/components/BackButton";
import { ThemeToggle } from "@/lib/theme";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { BadgeCheck, ShieldAlert, ShieldX } from "lucide-react";
import { verifyPrescription } from "@/api/documents";
import { formatDate } from "@/lib/datetime";
import { FajmaMark } from "@/components/FajmaMark";

const verifyQO = (reference: string) =>
  queryOptions({
    queryKey: ["verify-prescription", reference],
    queryFn: () => verifyPrescription({ data: { reference } }),
  });

export const Route = createFileRoute("/verifier/$reference")({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(verifyQO(params.reference)),
  head: ({ params }) => ({
    meta: [
      { title: `Vérification d'ordonnance ${params.reference} — Fajma` },
      {
        name: "description",
        content:
          "Vérifiez en un scan l'authenticité d'une ordonnance électronique Fajma délivrée par un médecin vérifié.",
      },
      { property: "og:title", content: "Vérification d'ordonnance — Fajma" },
      {
        property: "og:description",
        content: "Contrôle d'authenticité des ordonnances électroniques Fajma.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: VerifyPage,
});

function VerifyPage() {
  const { reference } = Route.useParams();
  const { data } = useSuspenseQuery(verifyQO(reference));
  // Références DOC-… : certificats, arrêts de travail, courriers ; sinon ordonnance.
  const isDoc = reference.toUpperCase().startsWith("DOC-");
  const noun = isDoc
    ? data.valid && data.document
      ? data.document
      : "Document médical"
    : "Ordonnance";

  return (
    <div className="min-h-screen bg-sunu-surface">
      <header className="border-b border-sunu-line bg-sunu-card">
        <div className="mx-auto flex h-16 max-w-3xl items-center px-6">
          <BackButton to="/" />
          <Link to="/" className="flex items-center gap-2">
            <FajmaMark className="size-8" />
            <span className="text-xl font-bold text-sunu-green">Fajma</span>
          </Link>
          <ThemeToggle className="ml-auto mr-3" />
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-14">
        <h1 className="text-2xl font-bold text-sunu-dark">
          Vérification {isDoc ? "de document médical" : "d'ordonnance"}
        </h1>
        <p className="mt-1 text-sm text-sunu-ink/60">
          Référence contrôlée : <strong>{reference}</strong>
        </p>

        {!data.valid ? (
          <div className="mt-8 rounded-xl border border-red-200 bg-sunu-card p-8">
            <p className="flex items-center gap-2 text-lg font-bold text-red-600">
              <ShieldX className="size-5" />{" "}
              {isDoc ? "Document non reconnu" : "Ordonnance non reconnue"}
            </p>
            <p className="mt-2 text-sm text-sunu-ink/70">
              {isDoc
                ? "Aucun document Fajma ne correspond à cette référence : il peut s'agir d'un faux. Contactez le médecin indiqué."
                : "Aucune ordonnance Fajma ne correspond à cette référence. Ne la délivrez pas et contactez le prescripteur."}
            </p>
          </div>
        ) : (
          <div
            className={`mt-8 rounded-xl border bg-sunu-card p-8 ${data.expired ? "border-amber-300" : "border-sunu-line"}`}
          >
            {data.expired ? (
              <p className="flex items-center gap-2 text-lg font-bold text-amber-600">
                <ShieldAlert className="size-5" /> Ordonnance authentique mais expirée
              </p>
            ) : (
              <p className="flex items-center gap-2 text-lg font-bold text-sunu-teal">
                <BadgeCheck className="size-5" /> {noun} authentique
              </p>
            )}
            <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
              <Row label={isDoc ? "Médecin" : "Prescripteur"} value={data.doctor_name ?? "—"} />
              <Row label="Spécialité" value={data.doctor_specialty ?? "—"} />
              <Row label="N° d'inscription à l'Ordre" value={data.doctor_order_number ?? "—"} />
              {data.replacing && <Row label="Remplaçant de" value={data.replacing} />}
              <Row
                label="Lieu d'exercice"
                value={[data.practice_name, data.doctor_city].filter(Boolean).join(", ") || "—"}
              />
              <Row label="Délivrée le" value={formatDate(data.created_at)} />
              {isDoc ? (
                <>
                  <Row label="Patient (initiales)" value={data.patient_initials ?? "—"} />
                  {data.start_date && data.end_date && (
                    <Row
                      label="Période d'arrêt"
                      value={`du ${formatDate(data.start_date)} au ${formatDate(data.end_date)}`}
                    />
                  )}
                </>
              ) : (
                <>
                  <Row
                    label="Valable jusqu'au"
                    value={data.valid_until ? formatDate(data.valid_until) : "Non précisé"}
                  />
                  <Row
                    label="Renouvellement"
                    value={data.renewals ? `${data.renewals} fois` : "Non renouvelable"}
                  />
                </>
              )}
              <Row label="Référence" value={data.reference ?? reference} />
            </dl>
            <p className="mt-6 text-xs text-sunu-ink/50">
              Pour préserver le secret médical, le contenu{" "}
              {isDoc ? "du document" : "de la prescription"} et l'identité complète du patient ne
              sont pas affichés ici : comparez-les avec le document présenté.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-sunu-line px-4 py-3">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-sunu-ink/50">
        {label}
      </dt>
      <dd className="mt-0.5 font-semibold text-sunu-dark">{value}</dd>
    </div>
  );
}
