import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ThemeToggle } from "@/lib/theme";
import { PharmacyOrderBox } from "@/components/PharmacyOrderBox";
import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowLeft,
  Download,
  Share2,
  ShieldAlert,
  FileDown,
  FileHeart,
  FileText,
  FolderOpen,
  HeartPulse,
  MapPin,
  Pill,
  Printer,
  Save,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import {
  getMyHealthData,
  getMyHealthProfile,
  updateMyHealthProfile,
  updateMyProfile,
} from "@/api/patient";
import { deleteMyAccount, exportMyDataUrl } from "@/api/auth";
import type { HealthProfile, Sex } from "@/api/types";
import type { Lang } from "@/lib/i18n";
import {
  deleteMyDocument,
  getMyDocumentUrl,
  listMyDocuments,
  listShareTargets,
  shareDocument,
  uploadMyDocument,
} from "@/api/documents";
import type { MedicalDocument as MedicalDocumentType } from "@/api/types";
import { SecuritySection } from "@/components/SecuritySection";
import { EmailSetting } from "@/components/EmailSetting";
import { MeasurementsSection } from "@/components/care/MeasurementsSection";
import { MedicationRemindersSection } from "@/components/care/MedicationRemindersSection";
import { LabOrdersSection } from "@/components/labs/LabOrdersSection";
import { PushToggle } from "@/components/PushToggle";
import { CoverageSection } from "@/components/CoverageSection";
import { CarnetSection } from "@/components/CarnetSection";
import { IssuedDocumentsSection } from "@/components/IssuedDocumentsSection";
import { AccessLogSection, PhoneVerification } from "@/components/AccountTrust";
import { usePrescriptionPdf } from "@/hooks/use-prescription-pdf";
import { RenewalBox } from "@/components/care/RenewalBox";
import { MedicalRecordPdfButton } from "@/components/care/MedicalRecordPdfButton";
import { FhirExportButton } from "@/components/care/FhirExportButton";
import { CareSheetButton } from "@/components/care/CareSheetButton";
import { EmergencyCardSection } from "@/components/care/EmergencyCardSection";
import { formatDate } from "@/lib/datetime";
import { FajmaMark } from "@/components/FajmaMark";

const healthQO = queryOptions({ queryKey: ["my-health-data"], queryFn: () => getMyHealthData() });
const documentsQO = queryOptions({ queryKey: ["my-documents"], queryFn: () => listMyDocuments() });

const CATEGORIES = [
  { value: "analyse", label: "Analyse" },
  { value: "imagerie", label: "Imagerie" },
  { value: "ordonnance", label: "Ordonnance" },
  { value: "autre", label: "Autre" },
] as const;

type Category = (typeof CATEGORIES)[number]["value"];

export const Route = createFileRoute("/_authenticated/dossier")({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(healthQO),
      context.queryClient.ensureQueryData(documentsQO),
    ]),
  head: () => ({
    meta: [
      { title: "Mon dossier médical — Fajma" },
      {
        name: "description",
        content: "Consultez vos comptes-rendus et ordonnances en toute sécurité.",
      },
      { property: "og:title", content: "Mon dossier médical — Fajma" },
      { property: "og:description", content: "Espace santé personnel et confidentiel." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DossierPage,
});

/**
 * Rubriques du dossier : quatorze sections à la file faisaient une page de plus de 10 000 pixels, où
 * trouver sa fiche d'urgence demandait de tout faire défiler. Les anciens liens (/dossier#analyses,
 * #medicaments, #carnet) ouvrent directement la bonne rubrique.
 */
type Rubric = "soins" | "suivi" | "informations" | "compte";

const RUBRICS: { id: Rubric; label: string; icon: typeof FileText }[] = [
  { id: "soins", label: "Mes soins", icon: FileText },
  { id: "suivi", label: "Mon suivi", icon: Activity },
  { id: "informations", label: "Mes informations", icon: HeartPulse },
  { id: "compte", label: "Mon compte", icon: ShieldCheck },
];

/** Ancre d'un lien reçu par SMS ou notification → rubrique à ouvrir. */
const ANCHORS: Record<string, Rubric> = {
  analyses: "soins",
  ordonnances: "soins",
  medicaments: "suivi",
  suivi: "suivi",
  carnet: "suivi",
  urgence: "informations",
  documents: "informations",
  securite: "compte",
};

function DossierPage() {
  const qc = useQueryClient();
  const { data } = useSuspenseQuery(healthQO);
  const [rubric, setRubric] = useState<Rubric>("soins");
  // Un lien d'SMS ou de notification ouvre directement la bonne rubrique, puis fait défiler jusqu'à la section.
  useEffect(() => {
    const open = () => {
      const anchor = window.location.hash.slice(1);
      const target = ANCHORS[anchor];
      if (!target) return;
      setRubric(target);
      requestAnimationFrame(() =>
        document.getElementById(anchor)?.scrollIntoView({ block: "start", behavior: "smooth" }),
      );
    };
    open();
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, []);
  const [form, setForm] = useState({
    full_name: data.profile?.full_name ?? "",
    phone: data.profile?.phone ?? "",
    city: data.profile?.city ?? "",
    notification_channel: (data.profile?.notification_channel === "whatsapp"
      ? "whatsapp"
      : "sms") as "sms" | "whatsapp",
    preferred_language: (data.profile?.preferred_language ?? "fr") as Lang,
    // Âge et sexe : imprimés sur les ordonnances.
    birth_date: data.profile?.birth_date ?? "",
    sex: (data.profile?.sex ?? "") as Sex | "",
  });
  const save = useMutation({
    mutationFn: () => updateMyProfile({ data: form }),
    onSuccess: () => {
      toast.success("Profil mis à jour");
      qc.invalidateQueries({ queryKey: ["my-health-data"] });
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <div className="min-h-screen bg-sunu-surface">
      <header className="border-b border-sunu-line bg-sunu-card">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link to="/" className="flex items-center gap-2">
            <FajmaMark className="size-8" />
            <span className="text-xl font-bold text-sunu-green">Fajma</span>
          </Link>
          <ThemeToggle className="ml-auto mr-3" />
          <Link
            to="/mon-espace"
            className="flex items-center gap-1 text-sm font-semibold text-sunu-ink/60"
          >
            <ArrowLeft className="size-4" /> Mon espace
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-10">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-sunu-green">
            Confidentiel
          </p>
          <h1 className="mt-1 text-3xl font-bold text-sunu-dark">Mon dossier médical</h1>
          <p className="mt-2 text-sm text-sunu-ink/60">
            Vos informations, comptes-rendus et ordonnances au même endroit.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <MedicalRecordPdfButton />
            <FhirExportButton />
          </div>
        </div>
        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
          <aside className="min-w-0 self-start rounded-xl border border-sunu-line bg-sunu-card p-5">
            <h2 className="flex items-center gap-2 font-bold text-sunu-dark">
              <FileHeart className="size-5 text-sunu-green" /> Mes coordonnées
            </h2>
            <div className="mt-4 grid gap-3">
              <PhoneVerification />
              <input
                aria-label="Nom complet"
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                placeholder="Nom complet"
                className="rounded-lg border border-sunu-line px-3 py-2.5 text-sm outline-none focus:border-sunu-green"
              />
              <input
                aria-label="Téléphone"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="Téléphone"
                className="rounded-lg border border-sunu-line px-3 py-2.5 text-sm outline-none focus:border-sunu-green"
              />
              <EmailSetting />
              <label className="flex items-center gap-2 rounded-lg border border-sunu-line px-3 py-2.5">
                <MapPin className="size-4 text-sunu-green" />
                <input
                  aria-label="Ville"
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                  placeholder="Ville"
                  className="min-w-0 flex-1 text-sm outline-none"
                />
              </label>
              <label className="grid gap-1 text-xs font-semibold text-sunu-ink/60">
                Rappels de rendez-vous
                <select
                  value={form.notification_channel}
                  onChange={(e) =>
                    setForm({ ...form, notification_channel: e.target.value as "sms" | "whatsapp" })
                  }
                  className="rounded-lg border border-sunu-line bg-sunu-card px-3 py-2.5 text-sm font-normal text-sunu-ink outline-none focus:border-sunu-green"
                >
                  <option value="sms">Par SMS</option>
                  <option value="whatsapp">Par WhatsApp</option>
                </select>
              </label>
              <label className="grid gap-1 text-xs font-semibold text-sunu-ink/60">
                Langue des messages
                <select
                  value={form.preferred_language}
                  onChange={(e) => setForm({ ...form, preferred_language: e.target.value as Lang })}
                  className="rounded-lg border border-sunu-line bg-sunu-card px-3 py-2.5 text-sm font-normal text-sunu-ink outline-none focus:border-sunu-green"
                >
                  <option value="fr">Français</option>
                  <option value="wo">Wolof</option>
                  <option value="en">English</option>
                </select>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="grid gap-1 text-xs font-semibold text-sunu-ink/60">
                  Date de naissance
                  <input
                    type="date"
                    value={form.birth_date}
                    max={new Date().toISOString().slice(0, 10)}
                    onChange={(e) => setForm({ ...form, birth_date: e.target.value })}
                    className="rounded-lg border border-sunu-line bg-sunu-card px-3 py-2 text-sm font-normal text-sunu-ink outline-none focus:border-sunu-green"
                  />
                </label>
                <label className="grid gap-1 text-xs font-semibold text-sunu-ink/60">
                  Sexe
                  <select
                    value={form.sex}
                    onChange={(e) => setForm({ ...form, sex: e.target.value as Sex | "" })}
                    className="rounded-lg border border-sunu-line bg-sunu-card px-3 py-2.5 text-sm font-normal text-sunu-ink outline-none focus:border-sunu-green"
                  >
                    <option value="">—</option>
                    <option value="F">Féminin</option>
                    <option value="M">Masculin</option>
                  </select>
                </label>
              </div>
              <p className="text-[11px] text-sunu-ink/50">
                Votre âge et votre sexe figurent sur vos ordonnances (dosages adaptés).
              </p>
              <button
                onClick={() => save.mutate()}
                disabled={save.isPending}
                className="flex items-center justify-center gap-2 rounded-lg bg-sunu-green px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                <Save className="size-4" /> Enregistrer
              </button>
            </div>
          </aside>
          <div className="min-w-0">
            <nav
              aria-label="Rubriques du dossier"
              className="-mx-6 mb-6 flex gap-1 overflow-x-auto border-b border-sunu-line px-6 pb-2"
            >
              {RUBRICS.map((r) => (
                <button
                  key={r.id}
                  onClick={() => {
                    setRubric(r.id);
                    window.history.replaceState(null, "", "/dossier");
                  }}
                  aria-current={rubric === r.id ? "page" : undefined}
                  className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold ${rubric === r.id ? "bg-sunu-green text-white" : "text-sunu-ink/65 hover:bg-sunu-card hover:text-sunu-green"}`}
                >
                  <r.icon className="size-4" /> {r.label}
                </button>
              ))}
            </nav>
            <div className={rubric === "soins" ? "space-y-8" : "hidden"}>
              <section>
                <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-sunu-dark">
                  <FileText className="size-5 text-sunu-green" /> Comptes-rendus (
                  {data.records.length})
                </h2>
                {data.records.length === 0 ? (
                  <Empty text="Aucun compte-rendu pour le moment." />
                ) : (
                  <div className="grid gap-3">
                    {data.records.map((r) => (
                      <article
                        key={r.id}
                        className="rounded-xl border border-sunu-line bg-sunu-card p-5"
                      >
                        <div className="flex flex-wrap justify-between gap-2">
                          <div>
                            <h3 className="font-bold text-sunu-dark">{r.doctor?.full_name}</h3>
                            <p className="text-xs text-sunu-green">{r.doctor?.specialty?.name}</p>
                          </div>
                          <time className="text-xs text-sunu-ink/50">
                            {formatDate(r.created_at)}
                          </time>
                        </div>
                        <p className="mt-3 text-sm leading-relaxed text-sunu-ink/75">{r.summary}</p>
                        {r.diagnosis && (
                          <p className="mt-3 text-sm">
                            <strong>Conclusion :</strong> {r.diagnosis}
                          </p>
                        )}
                        {r.treatment && (
                          <p className="mt-1 text-sm">
                            <strong>Traitement :</strong> {r.treatment}
                          </p>
                        )}
                        <CareSheetButton appointmentId={r.appointment_id} />
                      </article>
                    ))}
                  </div>
                )}
              </section>
              <section>
                <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-sunu-dark">
                  <Pill className="size-5 text-sunu-teal" /> Ordonnances (
                  {data.prescriptions.length})
                </h2>
                {data.prescriptions.length === 0 ? (
                  <Empty text="Aucune ordonnance enregistrée." />
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {data.prescriptions.map((p) => (
                      <article
                        key={p.id}
                        className="flex flex-col rounded-xl border border-sunu-line bg-sunu-card p-5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs font-semibold text-sunu-green">
                            {p.doctor?.full_name}
                          </p>
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-sunu-ink/45">
                            {p.reference ?? ""}
                          </span>
                        </div>
                        {p.for_relative && (
                          <p className="mt-1 text-xs font-semibold text-sunu-ink/70">
                            Pour {p.for_relative}
                          </p>
                        )}
                        <p className="mt-2 whitespace-pre-wrap text-sm font-medium text-sunu-dark">
                          {p.content}
                        </p>
                        {p.instructions && (
                          <p className="mt-2 text-xs text-sunu-ink/60">{p.instructions}</p>
                        )}
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-sunu-line pt-3">
                          <time className="text-xs text-sunu-ink/50">
                            {formatDate(p.created_at)}
                          </time>
                          <div className="flex gap-2">
                            <PdfButton id={p.id} />
                            <Link
                              to="/ordonnance/$id"
                              params={{ id: p.id }}
                              className="flex items-center gap-1 rounded-lg border border-sunu-line px-3 py-1.5 text-xs font-semibold text-sunu-green"
                            >
                              <Printer className="size-3.5" /> Voir
                            </Link>
                          </div>
                        </div>
                        <PharmacyOrderBox prescriptionId={p.id} />
                        <RenewalBox
                          prescriptionId={p.id}
                          createdAt={p.created_at}
                          doctorId={p.doctor?.id}
                        />
                      </article>
                    ))}
                  </div>
                )}
              </section>
              <LabOrdersSection />
              <IssuedDocumentsSection />
            </div>
            <div className={rubric === "suivi" ? "space-y-8" : "hidden"}>
              <MedicationRemindersSection prescriptions={data.prescriptions} />
              <MeasurementsSection />
              <CarnetSection />
            </div>
            <div className={rubric === "informations" ? "space-y-8" : "hidden"}>
              <HealthProfileSection />
              <EmergencyCardSection />
              <DocumentsSection />
              <CoverageSection />
            </div>
            <div className={rubric === "compte" ? "space-y-8" : "hidden"}>
              <PushToggle />
              <SecuritySection showEmail={false} />
              <AccessLogSection />
              <MyDataSection />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function DocumentsSection() {
  const qc = useQueryClient();
  const { data: docs } = useSuspenseQuery(documentsQO);
  const inputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<Category>("analyse");
  const [file, setFile] = useState<File | null>(null);

  const upload = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Choisissez un fichier");
      if (file.size > 6 * 1024 * 1024) throw new Error("Fichier trop volumineux (max 6 Mo)");
      const buffer = await file.arrayBuffer();
      let binary = "";
      const bytes = new Uint8Array(buffer);
      for (let i = 0; i < bytes.length; i += 8192)
        binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      return uploadMyDocument({
        data: {
          title: title.trim() || file.name,
          category,
          file_name: file.name,
          mime_type: file.type || "application/octet-stream",
          content_base64: btoa(binary),
        },
      });
    },
    onSuccess: () => {
      toast.success("Document ajouté");
      setTitle("");
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      qc.invalidateQueries({ queryKey: ["my-documents"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const open = useMutation({
    mutationFn: (id: string) => getMyDocumentUrl({ data: { id } }),
    onSuccess: (res) => window.open(res.url, "_blank", "noopener"),
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteMyDocument({ data: { id } }),
    onSuccess: () => {
      toast.success("Document supprimé");
      qc.invalidateQueries({ queryKey: ["my-documents"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-sunu-dark">
        <FolderOpen className="size-5 text-sunu-green" /> Mes documents ({docs.length})
      </h2>
      <div className="rounded-xl border border-sunu-line bg-sunu-card p-5">
        <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
          <input
            aria-label="Titre du document"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Titre (ex. Bilan sanguin mars)"
            className="rounded-lg border border-sunu-line px-3 py-2.5 text-sm outline-none focus:border-sunu-green"
          />
          <select
            aria-label="Catégorie"
            value={category}
            onChange={(e) => setCategory(e.target.value as Category)}
            className="rounded-lg border border-sunu-line px-3 py-2.5 text-sm outline-none focus:border-sunu-green"
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <input
          ref={inputRef}
          type="file"
          aria-label="Fichier"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="mt-3 w-full text-sm text-sunu-ink/70 file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-sunu-green-soft file:px-3 file:py-2 file:text-xs file:font-semibold file:text-sunu-green hover:file:bg-sunu-green/20"
        />
        <button
          onClick={() => upload.mutate()}
          disabled={upload.isPending || !file}
          className="mt-3 flex items-center gap-2 rounded-lg bg-sunu-teal px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          <Upload className="size-4" /> {upload.isPending ? "Envoi…" : "Ajouter le document"}
        </button>
        <p className="mt-2 text-xs text-sunu-ink/50">
          PDF ou image, 6 Mo maximum. Vos documents sont privés et chiffrés côté serveur.
        </p>
      </div>
      {docs.length === 0 ? (
        <div className="mt-3">
          <Empty text="Aucun document pour le moment." />
        </div>
      ) : (
        <ul className="mt-3 grid gap-2">
          {docs.map((d) => (
            <li
              key={d.id}
              className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-xl border border-sunu-line bg-sunu-card p-4"
            >
              <div className="min-w-0 max-w-full flex-1 basis-48">
                <p className="truncate text-sm font-semibold text-sunu-dark">{d.title}</p>
                <p className="text-xs text-sunu-ink/55">
                  {CATEGORIES.find((c) => c.value === d.category)?.label ?? d.category} ·{" "}
                  {formatDate(d.created_at)}
                  {d.size_bytes ? ` · ${Math.max(1, Math.round(d.size_bytes / 1024))} Ko` : ""}
                </p>
                <p className="mt-0.5 text-xs text-sunu-ink/55">
                  {d.shared_with.length
                    ? `Partagé avec ${d.shared_with.map((s) => s.doctor_name).join(", ")}`
                    : "Visible par vous seul"}
                </p>
              </div>
              <div className="flex gap-2">
                <ShareControl doc={d} />
                <button
                  onClick={() => open.mutate(d.id)}
                  className="flex items-center gap-1 rounded-lg border border-sunu-line px-3 py-1.5 text-xs font-semibold text-sunu-green"
                >
                  <Download className="size-3.5" /> Ouvrir
                </button>
                <button
                  onClick={() => remove.mutate(d.id)}
                  className="flex items-center gap-1 rounded-lg border border-sunu-line px-3 py-1.5 text-xs font-semibold text-red-600"
                >
                  <Trash2 className="size-3.5" /> Supprimer
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ShareControl({ doc }: { doc: MedicalDocumentType }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data: targets } = useQuery({
    queryKey: ["share-targets"],
    queryFn: listShareTargets,
    enabled: open,
  });
  // État local mis à jour immédiatement (la case se coche sans attendre le serveur).
  const [shared, setShared] = useState(() => new Set(doc.shared_with.map((s) => s.doctor_id)));
  const toggle = useMutation({
    mutationFn: (v: { doctor_id: string; shared: boolean }) =>
      shareDocument({ data: { id: doc.id, ...v } }),
    onMutate: (v) =>
      setShared((prev) => {
        const next = new Set(prev);
        if (v.shared) next.add(v.doctor_id);
        else next.delete(v.doctor_id);
        return next;
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-documents"] }),
    onError: (e: Error) => {
      toast.error(e.message);
      setShared(new Set(doc.shared_with.map((s) => s.doctor_id)));
    },
  });
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-1 rounded-lg border border-sunu-line px-3 py-1.5 text-xs font-semibold text-sunu-ink/70 hover:border-sunu-green hover:text-sunu-green"
      >
        <Share2 className="size-3.5" /> Partager
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-72 rounded-xl border border-sunu-line bg-sunu-card p-3 shadow-sunu-card">
          <p className="mb-2 text-xs font-semibold text-sunu-ink/60">
            Médecins pouvant consulter ce document :
          </p>
          {(targets ?? []).length === 0 ? (
            <p className="text-xs text-sunu-ink/50">
              Prenez d'abord rendez-vous avec un médecin pour pouvoir lui partager vos documents.
            </p>
          ) : (
            (targets ?? []).map((t) => (
              <label
                key={t.id}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-sunu-surface"
              >
                <input
                  type="checkbox"
                  checked={shared.has(t.id)}
                  onChange={(e) => toggle.mutate({ doctor_id: t.id, shared: e.target.checked })}
                  className="accent-sunu-green"
                />
                <span>
                  {t.full_name}
                  {t.specialty && (
                    <span className="block text-[11px] text-sunu-ink/50">{t.specialty}</span>
                  )}
                </span>
              </label>
            ))
          )}
        </div>
      )}
    </div>
  );
}

const HEALTH_FIELDS: {
  key: Exclude<keyof HealthProfile, "blood_group" | "updated_at">;
  label: string;
  placeholder: string;
}[] = [
  { key: "allergies", label: "Allergies", placeholder: "Ex. pénicilline, arachide…" },
  {
    key: "conditions",
    label: "Antécédents et maladies chroniques",
    placeholder: "Ex. diabète, hypertension, drépanocytose…",
  },
  {
    key: "treatments",
    label: "Traitements en cours",
    placeholder: "Médicaments pris régulièrement",
  },
  { key: "vaccinations", label: "Vaccinations", placeholder: "Ex. fièvre jaune (2021), COVID-19…" },
  { key: "emergency_contact", label: "Personne à prévenir", placeholder: "Nom et téléphone" },
];

function HealthProfileSection() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["health-profile"], queryFn: getMyHealthProfile });
  const [form, setForm] = useState<Omit<HealthProfile, "updated_at"> | null>(null);
  const values = form ?? {
    blood_group: data?.blood_group ?? "",
    allergies: data?.allergies ?? "",
    conditions: data?.conditions ?? "",
    treatments: data?.treatments ?? "",
    vaccinations: data?.vaccinations ?? "",
    emergency_contact: data?.emergency_contact ?? "",
  };
  const save = useMutation({
    mutationFn: () => updateMyHealthProfile({ data: values }),
    onSuccess: () => {
      toast.success("Profil de santé enregistré");
      setForm(null);
      qc.invalidateQueries({ queryKey: ["health-profile"] });
    },
    onError: (e) => toast.error(e.message),
  });
  const set = (patch: Partial<typeof values>) => setForm({ ...values, ...patch });
  return (
    <section>
      <h2 className="mb-1 flex items-center gap-2 text-lg font-bold text-sunu-dark">
        <Activity className="size-5 text-sunu-green" /> Mon profil de santé
      </h2>
      <p className="mb-3 text-xs text-sunu-ink/55">
        Partagé uniquement avec les médecins qui ont confirmé un rendez-vous avec vous.
      </p>
      <div className="grid gap-3 rounded-xl border border-sunu-line bg-sunu-card p-5 sm:grid-cols-2">
        <label className="grid gap-1 text-xs font-semibold text-sunu-ink/60">
          Groupe sanguin
          <select
            value={values.blood_group}
            onChange={(e) => set({ blood_group: e.target.value })}
            className="rounded-lg border border-sunu-line bg-sunu-card px-3 py-2.5 text-sm font-normal text-sunu-ink"
          >
            <option value="">Je ne sais pas</option>
            {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
        {HEALTH_FIELDS.map((f) => (
          <label
            key={f.key}
            className={`grid gap-1 text-xs font-semibold text-sunu-ink/60 ${f.key === "emergency_contact" ? "" : "sm:col-span-2"}`}
          >
            {f.label}
            {f.key === "emergency_contact" ? (
              <input
                value={values[f.key]}
                onChange={(e) => set({ [f.key]: e.target.value })}
                placeholder={f.placeholder}
                className="rounded-lg border border-sunu-line px-3 py-2.5 text-sm font-normal text-sunu-ink"
              />
            ) : (
              <textarea
                value={values[f.key]}
                onChange={(e) => set({ [f.key]: e.target.value })}
                placeholder={f.placeholder}
                rows={2}
                className="rounded-lg border border-sunu-line px-3 py-2 text-sm font-normal text-sunu-ink"
              />
            )}
          </label>
        ))}
        <button
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="flex items-center justify-center gap-2 rounded-lg bg-sunu-green px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 sm:col-span-2"
        >
          <Save className="size-4" /> Enregistrer mon profil de santé
        </button>
      </div>
    </section>
  );
}

function MyDataSection() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState("");
  const remove = useMutation({
    mutationFn: () => deleteMyAccount(password),
    onSuccess: async () => {
      qc.clear();
      toast.success("Votre compte a été supprimé.");
      navigate({ to: "/", replace: true });
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-sunu-dark">
        <ShieldAlert className="size-5 text-sunu-green" /> Mes données personnelles
      </h2>
      <div className="grid gap-4 rounded-xl border border-sunu-line bg-sunu-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-sunu-ink/70">
            Téléchargez toutes les données de votre compte (rendez-vous, dossier, messages…).
          </p>
          <a
            href={exportMyDataUrl}
            className="flex items-center gap-2 rounded-lg border border-sunu-line px-4 py-2 text-sm font-semibold text-sunu-green hover:border-sunu-green"
          >
            <Download className="size-4" /> Exporter mes données
          </a>
        </div>
        <div className="border-t border-sunu-line pt-4">
          {!confirming ? (
            <button
              onClick={() => setConfirming(true)}
              className="text-sm font-semibold text-red-600 hover:underline"
            >
              Supprimer mon compte
            </button>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                remove.mutate();
              }}
              className="grid gap-2"
            >
              <p className="text-sm text-sunu-ink/70">
                Vos informations personnelles, proches, documents et profil de santé seront effacés,
                et vos rendez-vous à venir annulés. Les comptes-rendus restent conservés par vos
                médecins, comme la loi l'exige, sans votre nom.
              </p>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Votre mot de passe pour confirmer"
                autoComplete="current-password"
                className="rounded-lg border border-sunu-line px-3 py-2.5 text-sm"
              />
              <div className="flex gap-2">
                <button
                  disabled={remove.isPending}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Supprimer définitivement
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="rounded-lg border border-sunu-line px-4 py-2 text-sm font-semibold"
                >
                  Annuler
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-sunu-line bg-sunu-card p-8 text-center text-sm text-sunu-ink/55">
      {text}
    </div>
  );
}

function PdfButton({ id }: { id: string }) {
  const pdf = usePrescriptionPdf();
  return (
    <button
      onClick={() => pdf.mutate(id)}
      disabled={pdf.isPending}
      className="flex items-center gap-1 rounded-lg bg-sunu-green px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
    >
      <FileDown className="size-3.5" /> {pdf.isPending ? "…" : "PDF"}
    </button>
  );
}
