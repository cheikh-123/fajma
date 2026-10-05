import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { FlaskConical, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { getLabDashboard, labReceive, labUploadResult, type LabOrder } from "@/api/labs";
import { NotificationBell } from "@/components/NotificationBell";
import { LogoutButton } from "@/components/LogoutButton";
import { HelpLink } from "@/components/HelpLink";
import { SecuritySection } from "@/components/SecuritySection";
import { CredentialsPanel } from "@/components/pro/CredentialsPanel";
import { LabEditor } from "@/components/labs/LabEditor";
import { ThemeToggle } from "@/lib/theme";
import { formatDate, formatDateTime } from "@/lib/datetime";
import { ageAt } from "@/lib/prescription-text";

export const Route = createFileRoute("/_authenticated/laboratoire")({
  head: () => ({
    meta: [{ title: "Espace laboratoire — Fajma" }, { name: "robots", content: "noindex" }],
  }),
  component: LabPage,
});

const COLUMNS: { status: LabOrder["status"]; title: string }[] = [
  { status: "sent", title: "Patients attendus" },
  { status: "received", title: "Prélevés, résultats à déposer" },
  { status: "completed", title: "Résultats envoyés" },
];

function LabPage() {
  const { data, error, isLoading } = useQuery({
    queryKey: ["lab-dashboard"],
    queryFn: getLabDashboard,
    refetchInterval: 30_000,
  });
  const [q, setQ] = useState("");
  if (isLoading) return <Loader2 className="m-10 size-6 animate-spin text-sunu-ink/40" />;
  if (error || !data) {
    return (
      <div className="mx-auto max-w-lg px-6 py-16 text-center">
        <FlaskConical className="mx-auto size-10 text-sunu-ink/30" />
        <h1 className="mt-4 text-xl font-bold text-sunu-dark">
          Espace réservé aux laboratoires partenaires
        </h1>
        <p className="mt-2 text-sm text-sunu-ink/60">
          Votre compte n'est pas encore rattaché à un laboratoire. Contactez l'équipe Fajma pour
          être vérifié.
        </p>
        <Link to="/" className="mt-6 inline-block text-sm font-semibold text-sunu-green">
          Retour à l'accueil
        </Link>
      </div>
    );
  }
  const needle = q.trim().toLowerCase();
  const orders = data.orders.filter(
    (o) =>
      !needle ||
      o.reference.toLowerCase().includes(needle) ||
      (o.patient?.full_name ?? "").toLowerCase().includes(needle),
  );
  return (
    <div className="min-h-screen bg-sunu-surface">
      <header className="border-b border-sunu-line bg-sunu-card">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <Link to="/" className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-lg bg-sunu-green text-white">
              <FlaskConical className="size-4" />
            </span>
            <span className="font-bold text-sunu-dark">
              {data.laboratories.map((l) => l.name).join(" · ")}
            </span>
          </Link>
          <ThemeToggle className="ml-auto mr-3" />
          <NotificationBell />
          <HelpLink />
          <LogoutButton />
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-sunu-dark">Demandes d'analyses</h1>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Référence (LAB-…) ou nom du patient"
            aria-label="Rechercher une demande"
            className="w-72 max-w-full rounded-lg border border-sunu-line bg-sunu-card px-3 py-2 text-sm"
          />
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {COLUMNS.map((col) => {
            const items = orders.filter((o) => o.status === col.status);
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
        <div className="mt-10 grid gap-4 lg:grid-cols-2">
          {data.laboratories.map((l) => (
            <LabEditor key={`fiche-${l.id}`} lab={l} />
          ))}
          {data.laboratories.map((l) => (
            <CredentialsPanel
              key={l.id}
              ownerType="laboratory"
              ownerId={l.id}
              title={`Justificatifs · ${l.name}`}
            />
          ))}
        </div>
        <div className="mt-10">
          <SecuritySection />
        </div>
      </main>
    </div>
  );
}

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("Lecture du fichier impossible"));
    reader.readAsDataURL(file);
  });
}

function OrderCard({ order }: { order: LabOrder }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState("");
  const refresh = () => qc.invalidateQueries({ queryKey: ["lab-dashboard"] });
  const receive = useMutation({
    mutationFn: () => labReceive(order.id),
    onSuccess: refresh,
    onError: (e) => toast.error(e.message),
  });
  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (file.size > 6_000_000) throw new Error("Fichier trop lourd (6 Mo au plus)");
      return labUploadResult(order.id, {
        file_name: file.name,
        content_base64: await toBase64(file),
        note: note || undefined,
      });
    },
    onSuccess: () => {
      toast.success("Résultats envoyés au patient et au médecin prescripteur");
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const p = order.patient;
  const age = p?.birth_date ? ageAt(p.birth_date, new Date().toISOString()) : null;
  return (
    <article className="rounded-xl border border-sunu-line p-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-bold text-sunu-dark">{p?.full_name}</p>
          <p className="text-[11px] text-sunu-ink/55">
            {[age, p?.sex === "F" ? "femme" : p?.sex === "M" ? "homme" : null, p?.phone]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <span className="text-[10px] font-semibold text-sunu-ink/50">{order.reference}</span>
      </div>
      {order.urgent && <p className="mt-1 text-[11px] font-bold text-red-700">URGENT</p>}
      <p className="mt-2 whitespace-pre-wrap rounded-lg bg-sunu-surface px-2.5 py-2 font-medium text-sunu-dark">
        {order.tests}
      </p>
      {order.instructions && <p className="mt-1 text-xs text-sunu-ink/60">{order.instructions}</p>}
      <p className="mt-1 text-[11px] text-sunu-ink/50">
        Prescrit par {order.doctor.full_name} le {formatDate(order.created_at)}
        {order.received_at &&
          ` · prélevé ${formatDateTime(order.received_at, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`}
      </p>
      {order.status === "sent" && (
        <button
          onClick={() => receive.mutate()}
          disabled={receive.isPending}
          className="mt-2 w-full rounded-lg bg-sunu-green px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          Prélèvement effectué
        </button>
      )}
      {(order.status === "received" || order.status === "sent") && (
        <div className="mt-2 grid gap-1.5">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Commentaire (facultatif)"
            aria-label="Commentaire"
            className="rounded-lg border border-sunu-line bg-sunu-card px-2 py-1.5 text-xs"
          />
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) upload.mutate(f);
            }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={upload.isPending}
            className="flex items-center justify-center gap-1 rounded-lg border border-sunu-teal px-3 py-1.5 text-xs font-semibold text-sunu-teal disabled:opacity-50"
          >
            {upload.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Upload className="size-3.5" />
            )}{" "}
            Déposer les résultats (PDF)
          </button>
        </div>
      )}
      {order.status === "completed" && (
        <p className="mt-2 text-xs text-sunu-teal">
          {order.results.length} fichier(s) envoyé(s) le{" "}
          {order.completed_at ? formatDate(order.completed_at) : ""}
        </p>
      )}
    </article>
  );
}
