/** Dossier patient : certificats, arrêts de travail et courriers rédigés par ses médecins. */
import { useQuery } from "@tanstack/react-query";
import { Download, FileSignature } from "lucide-react";
import { toast } from "sonner";
import { listMyIssuedDocuments } from "@/api/documents";
import { formatDate } from "@/lib/datetime";
import { buildIssuedDocumentPdf } from "@/lib/medical-doc-pdf";
import { downloadPdf } from "@/lib/receipt-pdf";

export function IssuedDocumentsSection() {
  const { data } = useQuery({ queryKey: ["issued-documents"], queryFn: listMyIssuedDocuments });
  if (!data?.length) return null;
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-sunu-dark">
        <FileSignature className="size-5 text-sunu-green" /> Certificats et courriers ({data.length}
        )
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {data.map((d) => (
          <article
            key={d.id}
            className="flex items-start justify-between gap-3 rounded-xl border border-sunu-line bg-sunu-card p-4"
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold text-sunu-dark">{d.kind_label}</p>
              <p className="text-xs text-sunu-ink/55">
                {d.doctor.full_name} · {formatDate(d.created_at)}
                {d.subject_name && ` · ${d.subject_name}`}
              </p>
              {d.start_date && d.end_date && (
                <p className="text-xs text-sunu-ink/60">
                  Du {formatDate(d.start_date)} au {formatDate(d.end_date)}
                </p>
              )}
              {d.recipient && (
                <p className="truncate text-xs text-sunu-ink/60">Pour : {d.recipient}</p>
              )}
            </div>
            <button
              onClick={async () => {
                try {
                  downloadPdf(await buildIssuedDocumentPdf(d), `${d.kind}-${d.reference}.pdf`);
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
              className="flex shrink-0 items-center gap-1 rounded-lg border border-sunu-line px-3 py-1.5 text-xs font-semibold text-sunu-green"
            >
              <Download className="size-3.5" /> PDF
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
