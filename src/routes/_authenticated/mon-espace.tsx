import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { InstallApp } from "@/components/InstallApp";
import { QuestionnaireForm } from "@/components/QuestionnaireForm";
import {
  useSuspenseQuery,
  useQuery,
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useState } from "react";
import {
  Heart,
  Calendar,
  Video,
  MapPin,
  LogOut,
  Plus,
  X,
  Wallet,
  CheckCircle2,
  Sparkles,
  Pill,
  FileHeart,
  Star,
  MessageSquare,
  CalendarClock,
  CalendarPlus,
  Receipt,
  Users,
  House,
  Repeat,
  UserRoundCheck,
  Trash2,
  BellRing,
  Loader2,
  ExternalLink,
  Building2,
} from "lucide-react";
import { toast } from "sonner";
import {
  listMyAppointments,
  cancelAppointment,
  rescheduleAppointment,
  appointmentIcsUrl,
} from "@/api/appointments";
import { NotificationBell } from "@/components/NotificationBell";
import { HelpLink } from "@/components/HelpLink";
import { getReceipt, startPayment } from "@/api/payments";
import { buildReceiptPdf, downloadPdf } from "@/lib/receipt-pdf";
import { listDoctorSlots } from "@/api/directory";
import {
  addRelative,
  deleteRelative,
  leaveWaitlist,
  listMyRelatives,
  listMyWaitlist,
  createReview,
} from "@/api/patient";
import { logout, useMe } from "@/api/auth";
import { getMyClinic } from "@/api/clinic";
import { LanguageSwitcher, useI18n, type TKey } from "@/lib/i18n";
import { MyDoctorsPanel } from "@/components/MyDoctorsPanel";
import { ThemeToggle } from "@/lib/theme";
import { dayOfMonth, formatDate, formatDateTime } from "@/lib/datetime";

const apptsQO = queryOptions({
  queryKey: ["my-appointments"],
  queryFn: () => listMyAppointments(),
});
const relativesQO = queryOptions({ queryKey: ["my-relatives"], queryFn: () => listMyRelatives() });
const waitlistQO = queryOptions({ queryKey: ["my-waitlist"], queryFn: () => listMyWaitlist() });

export const Route = createFileRoute("/_authenticated/mon-espace")({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(apptsQO),
      context.queryClient.ensureQueryData(relativesQO),
    ]),
  head: () => ({
    meta: [
      { title: "Mon espace — Fajma" },
      { name: "description", content: "Retrouvez vos rendez-vous et votre dossier médical." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MyAreaPage,
});

const STATUS_CLS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  confirmed: "bg-sunu-teal/15 text-sunu-teal",
  cancelled: "bg-red-100 text-red-700",
  completed: "bg-sunu-green-soft text-sunu-green",
  no_show: "bg-gray-200 text-gray-700",
};

function MyAreaPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { t } = useI18n();
  const { data: appts } = useSuspenseQuery(apptsQO);
  const { data: clinic } = useQuery({ queryKey: ["my-clinic"], queryFn: () => getMyClinic() });
  const { data: me } = useMe();
  const refresh = () => qc.invalidateQueries({ queryKey: ["my-appointments"] });

  const pay = useMutation({
    mutationFn: (v: { id: string; method: PayMethod }) =>
      startPayment({ data: { appointment_id: v.id, method: v.method } }),
    onSuccess: (r) => {
      if (r.kind === "redirect") {
        window.location.assign(r.url);
        return;
      }
      toast.success(`Paiement au cabinet enregistré · réf. ${r.reference}`);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancel = useMutation({
    mutationFn: (v: { id: string; scope: "one" | "series" }) =>
      cancelAppointment({ data: { id: v.id, scope: v.scope } }),
    onSuccess: (res, v) => {
      if (v.scope === "series") {
        toast.success(t("appt.seriesCancelled", { n: res.cancelled }), {
          description: res.kept ? t("appt.seriesKept", { n: res.kept }) : undefined,
        });
      } else {
        toast.success("Rendez-vous annulé");
      }
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });

  const review = useMutation({
    mutationFn: (v: {
      appointment_id: string;
      doctor_id: string;
      rating: number;
      comment?: string;
    }) => createReview({ data: v }),
    onSuccess: (res) => {
      toast.success(
        res.pending_moderation
          ? "Merci ! Votre avis contient des coordonnées : il sera publié après vérification."
          : "Merci pour votre avis",
      );
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await logout();
    navigate({ to: "/", replace: true });
  }

  const now = new Date();
  const upcoming = appts
    .filter((a) => a.status !== "cancelled" && new Date(a.scheduled_at) >= now)
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  const past = appts.filter((a) => a.status === "cancelled" || new Date(a.scheduled_at) < now);

  return (
    <div className="min-h-screen bg-sunu-surface">
      <header className="border-b border-sunu-line bg-sunu-card">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-lg bg-sunu-green text-white">
              <Heart className="size-4" strokeWidth={2.5} />
            </span>
            <span className="text-xl font-bold text-sunu-green">Fajma</span>
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <ThemeToggle />
            <LanguageSwitcher />
            <HelpLink />
            <NotificationBell />
            <button
              onClick={signOut}
              className="flex items-center gap-1.5 text-sm font-medium text-sunu-ink/60 hover:text-sunu-green"
            >
              <LogOut className="size-4" />{" "}
              <span className="hidden sm:inline">{t("nav.logout")}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="mb-6">
          <InstallApp />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-sunu-dark">{t("space.title")}</h1>
            <p className="mt-1 text-sm text-sunu-ink/60">{t("space.subtitle")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {me?.is_admin && (
              <Link
                to="/admin"
                className="flex items-center gap-2 rounded-full bg-sunu-night px-4 py-2.5 text-sm font-semibold text-white"
              >
                Administration
              </Link>
            )}
            {me?.is_doctor && (
              <Link
                to="/pro"
                className="flex items-center gap-2 rounded-full bg-sunu-teal px-4 py-2.5 text-sm font-semibold text-white"
              >
                Espace médecin
              </Link>
            )}
            {me?.is_pharmacist && (
              <Link
                to="/pharmacie"
                className="flex items-center gap-2 rounded-full bg-sunu-teal px-4 py-2.5 text-sm font-semibold text-white"
              >
                Espace pharmacie
              </Link>
            )}
            {me?.is_lab && (
              <Link
                to="/laboratoire"
                className="flex items-center gap-2 rounded-full bg-sunu-teal px-4 py-2.5 text-sm font-semibold text-white"
              >
                Espace laboratoire
              </Link>
            )}
            {clinic && (
              <Link
                to="/clinique"
                className="flex items-center gap-2 rounded-full border border-sunu-line bg-sunu-card px-4 py-2.5 text-sm font-semibold text-sunu-ink/70 hover:border-sunu-green hover:text-sunu-green"
              >
                <Building2 className="size-4" /> {clinic.name}
              </Link>
            )}
            <NavPill to="/messages" icon={MessageSquare} label={t("nav.messages")} />
            <NavPill to="/dossier" icon={FileHeart} label={t("space.record")} />
            <NavPill to="/assistant" icon={Sparkles} label={t("nav.assistant")} />
            <NavPill to="/pharmacies" icon={Pill} label={t("nav.pharmacies")} />
            <Link
              to="/medecins"
              className="flex items-center gap-2 rounded-full bg-sunu-green px-5 py-2.5 text-sm font-semibold text-white hover:bg-sunu-green/90"
            >
              <Plus className="size-4" /> {t("space.new")}
            </Link>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0">
            <section>
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-sunu-ink/50">
                {t("space.upcoming")} ({upcoming.length})
              </h2>
              {upcoming.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-sunu-line bg-sunu-card p-10 text-center">
                  <Calendar className="mx-auto size-10 text-sunu-ink/30" />
                  <p className="mt-3 text-sm text-sunu-ink/60">{t("space.none")}</p>
                  <Link
                    to="/medecins"
                    className="mt-4 inline-block text-sm font-semibold text-sunu-green hover:underline"
                  >
                    {t("space.findDoctor")}
                  </Link>
                </div>
              ) : (
                <div className="grid gap-3">
                  {upcoming.map((a) => (
                    <ApptCard
                      key={a.id}
                      appt={a}
                      onCancel={(scope) => cancel.mutate({ id: a.id, scope })}
                      onPay={(method) => pay.mutate({ id: a.id, method })}
                      paying={pay.isPending}
                      onMoved={refresh}
                    />
                  ))}
                </div>
              )}
            </section>

            {past.length > 0 && (
              <section className="mt-10">
                <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-sunu-ink/50">
                  {t("space.past")}
                </h2>
                <div className="grid gap-3">
                  {past.map((a) => (
                    <ApptCard
                      key={a.id}
                      appt={a}
                      onReview={(rating, comment) =>
                        review.mutate({
                          appointment_id: a.id,
                          doctor_id: a.doctor_id,
                          rating,
                          comment,
                        })
                      }
                    />
                  ))}
                </div>
              </section>
            )}
          </div>

          <aside className="min-w-0 space-y-6">
            <MyDoctorsPanel />
            {me && !me.is_doctor && !me.is_pharmacist && !me.is_lab && !clinic && (
              <div className="rounded-2xl border border-dashed border-sunu-line bg-sunu-card p-5 text-sm">
                <p className="font-semibold text-sunu-dark">Vous êtes professionnel de santé ?</p>
                <p className="mt-1 text-xs text-sunu-ink/60">
                  Médecin : créez votre fiche et recevez vos patients sur Fajma. Pharmacie ou
                  laboratoire : contactez l'équipe Fajma pour rattacher votre compte à votre
                  établissement.
                </p>
                <Link to="/pro" className="mt-3 inline-block text-xs font-semibold text-sunu-green">
                  Créer ma fiche médecin →
                </Link>
              </div>
            )}
            <RelativesPanel />
            <WaitlistPanel />
          </aside>
        </div>
      </main>
    </div>
  );
}

function NavPill({
  to,
  icon: Icon,
  label,
}: {
  to: "/messages" | "/dossier" | "/assistant" | "/pharmacies";
  icon: typeof Heart;
  label: string;
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-2 rounded-full border border-sunu-line bg-sunu-card px-4 py-2.5 text-sm font-semibold text-sunu-ink/70 hover:border-sunu-green hover:text-sunu-green"
    >
      <Icon className="size-4" /> {label}
    </Link>
  );
}

type Appt = Awaited<ReturnType<typeof listMyAppointments>>[number];
type PayMethod = "wave" | "orange_money" | "free_money" | "cash";

const METHODS: { id: PayMethod; label: string }[] = [
  { id: "wave", label: "Wave" },
  { id: "orange_money", label: "Orange Money" },
  { id: "free_money", label: "Free Money" },
];

function ApptCard({
  appt,
  onCancel,
  onPay,
  paying,
  onReview,
  onMoved,
}: {
  appt: Appt;
  onCancel?: (scope: "one" | "series") => void;
  onPay?: (method: PayMethod) => void;
  paying?: boolean;
  onReview?: (rating: number, comment?: string) => void;
  onMoved?: () => void;
}) {
  const { t } = useI18n();
  const [openPay, setOpenPay] = useState(false);
  const [openReview, setOpenReview] = useState(false);
  const [openMove, setOpenMove] = useState(false);
  const [openCancel, setOpenCancel] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const payment = [...(appt.payments ?? [])].sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  )[0];
  const price = appt.amount_due;
  const d = new Date(appt.scheduled_at);
  const active = appt.status === "pending" || appt.status === "confirmed";

  return (
    <div className="rounded-2xl border border-sunu-line bg-sunu-card p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="grid size-14 shrink-0 place-items-center rounded-xl bg-sunu-green-soft text-sunu-green">
          <div className="text-center">
            <div className="text-[10px] font-semibold uppercase">
              {formatDate(d, { month: "short" })}
            </div>
            <div className="text-xl font-bold leading-none">{dayOfMonth(d)}</div>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-bold text-sunu-dark">{appt.doctor?.full_name}</h3>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_CLS[appt.status] ?? "bg-sunu-green-soft text-sunu-green"}`}
            >
              {t(`status.${appt.status}` as TKey)}
            </span>
            {appt.series && (
              <span className="inline-flex items-center gap-1 rounded-full bg-sunu-surface px-2 py-0.5 text-xs font-semibold text-sunu-ink/70">
                <Repeat className="size-3" />
                {t("appt.session", { i: appt.series.index, n: appt.series.total })}
              </span>
            )}
          </div>
          {appt.practitioner && (
            <p className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-sunu-dark">
              <UserRoundCheck className="size-3.5" />
              {t("appt.seenBy", {
                name: appt.practitioner.full_name,
                doctor: appt.doctor?.full_name ?? "",
              })}
            </p>
          )}
          <p className="text-sm text-sunu-green">
            {appt.consultation_type?.name ?? appt.doctor?.specialty?.name}
          </p>
          <p className="mt-1 text-sm text-sunu-ink/60">
            {formatDateTime(d, { weekday: "long", hour: "2-digit", minute: "2-digit" })}
            {" · "}
            {appt.mode === "teleconsultation" ? (
              <span className="inline-flex items-center gap-1">
                <Video className="size-3.5" /> {t("book.tele")}
              </span>
            ) : appt.mode === "home_visit" ? (
              <>
                <span className="inline-flex items-center gap-1 font-semibold text-sunu-dark">
                  <House className="size-3.5" /> {t("appt.home")}
                </span>
                {appt.visit && (
                  <span className="mt-0.5 block text-xs">
                    {appt.visit.address}
                    {appt.visit.landmark ? ` (${appt.visit.landmark})` : ""}
                  </span>
                )}
              </>
            ) : (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3.5" />{" "}
                {appt.location
                  ? `${appt.location.name}, ${appt.location.address}, ${appt.location.city}`
                  : appt.doctor?.city}
              </span>
            )}
          </p>
          {appt.relative && (
            <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-sunu-surface px-2 py-0.5 text-xs font-semibold text-sunu-ink/70">
              <Users className="size-3" /> {t("space.for")} {appt.relative.full_name}
            </p>
          )}
          {appt.reason && <p className="mt-1 text-xs text-sunu-ink/50">Motif : {appt.reason}</p>}
          {appt.insurance && (
            <p className="mt-1 text-xs text-sunu-ink/60">
              {appt.insurance.insurer} ({appt.insurance.coverage_percent} %)
              {appt.insurance.tiers_payant && appt.insurance.insurer_share != null
                ? ` · tiers payant : ${appt.insurance.insurer_share.toLocaleString("fr-FR")} F pris en charge`
                : " · reçu à présenter pour remboursement"}
            </p>
          )}
          <QuestionnaireForm appt={appt} />
          {appt.status === "cancelled" && appt.cancelled_by && appt.cancelled_by !== "patient" && (
            <p className="mt-1 text-xs font-semibold text-red-700">
              Annulé par {appt.cancelled_by === "doctor" ? "le médecin" : "le secrétariat"}
              {appt.cancel_reason ? ` : ${appt.cancel_reason}` : ""}
            </p>
          )}
          {active && appt.booking_instructions && (
            <p className="mt-2 rounded-lg bg-sunu-green-soft/50 px-3 py-2 text-xs text-sunu-ink/80">
              <b>Avant votre rendez-vous :</b> {appt.booking_instructions}
            </p>
          )}
          {active && !appt.can_cancel && (
            <p className="mt-1 text-xs text-sunu-ink/50">
              Annulation en ligne fermée ({appt.cancellation_deadline_hours} h avant) : contactez le
              cabinet.
            </p>
          )}
        </div>
        <div className="flex flex-col items-stretch gap-2 md:items-end">
          {payment?.refund_status ? (
            <span
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ${payment.refund_status === "done" ? "bg-sunu-teal/15 text-sunu-teal" : "bg-amber-50 text-amber-800"}`}
            >
              <Wallet className="size-3.5" />
              {payment.refund_status === "done" ? "Remboursé" : "Remboursement en cours"} ·{" "}
              {payment.amount.toLocaleString("fr-FR")} FCFA
            </span>
          ) : payment?.status === "paid" ? (
            <div className="flex flex-wrap items-center gap-1.5 md:justify-end">
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-sunu-teal/15 px-3 py-1.5 text-xs font-semibold text-sunu-teal">
                <CheckCircle2 className="size-3.5" /> {t("appt.paid")} ·{" "}
                {payment.amount.toLocaleString("fr-FR")} FCFA
              </span>
              <button
                onClick={async () => {
                  try {
                    const r = await getReceipt(payment.id);
                    downloadPdf(await buildReceiptPdf(r), `recu-${r.reference}.pdf`);
                  } catch (e) {
                    toast.error((e as Error).message);
                  }
                }}
                className="inline-flex items-center gap-1 rounded-lg border border-sunu-line px-2.5 py-1.5 text-xs font-semibold text-sunu-ink/70 hover:border-sunu-green hover:text-sunu-green"
              >
                <Receipt className="size-3.5" /> Reçu
              </button>
            </div>
          ) : payment?.status === "pending" && payment.method === "cash" ? (
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800">
              <Wallet className="size-3.5" /> {t("appt.cash")} ·{" "}
              {payment.amount.toLocaleString("fr-FR")} FCFA
            </span>
          ) : payment?.status === "pending" && payment.checkout_url && active ? (
            <a
              href={payment.checkout_url}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-500/90"
            >
              <ExternalLink className="size-3.5" /> {t("appt.finishPay")}
            </a>
          ) : null}
          {onPay && active && payment?.status !== "paid" && (
            <>
              <button
                onClick={() => setOpenPay((v) => !v)}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-sunu-green px-3 py-1.5 text-xs font-semibold text-white hover:bg-sunu-green/90"
              >
                <Wallet className="size-3.5" /> {t("appt.pay")} {price.toLocaleString("fr-FR")} FCFA
              </button>
              {openPay && (
                <div className="flex flex-wrap gap-1.5 md:justify-end">
                  {[...METHODS, { id: "cash" as const, label: t("appt.cash") }].map((m) => (
                    <button
                      key={m.id}
                      disabled={paying}
                      onClick={() => {
                        setOpenPay(false);
                        onPay(m.id);
                      }}
                      className="rounded-lg border border-sunu-line px-2.5 py-1.5 text-[11px] font-semibold text-sunu-ink/70 hover:border-sunu-green hover:text-sunu-green disabled:opacity-50"
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
          {appt.mode === "teleconsultation" && appt.status === "confirmed" && (
            <Link
              to="/teleconsultation/$id"
              params={{ id: appt.id }}
              className="flex items-center justify-center gap-1 rounded-lg bg-sunu-teal px-3 py-1.5 text-xs font-semibold text-white hover:bg-sunu-teal/90"
            >
              <Video className="size-3.5" /> {t("appt.join")}
            </Link>
          )}
          <div className="flex flex-wrap gap-2 md:justify-end">
            <Link
              to="/messages"
              search={{ doctor: appt.doctor_id }}
              className="flex items-center justify-center gap-1 rounded-lg border border-sunu-line px-3 py-1.5 text-xs font-semibold text-sunu-ink/70 hover:border-sunu-green hover:text-sunu-green"
            >
              <MessageSquare className="size-3.5" /> {t("appt.message")}
            </Link>
            {appt.status === "completed" && (
              <Link
                to="/dossier"
                className="flex items-center justify-center gap-1 rounded-lg border border-sunu-line px-3 py-1.5 text-xs font-semibold text-sunu-ink/70 hover:border-sunu-green hover:text-sunu-green"
              >
                <FileHeart className="size-3.5" /> Ordonnance et compte-rendu
              </Link>
            )}
            {active && (
              <a
                href={appointmentIcsUrl(appt.id)}
                className="flex items-center justify-center gap-1 rounded-lg border border-sunu-line px-3 py-1.5 text-xs font-semibold text-sunu-ink/70 hover:border-sunu-green hover:text-sunu-green"
              >
                <CalendarPlus className="size-3.5" /> Agenda
              </a>
            )}
            {onMoved && active && appt.can_cancel && (
              <button
                onClick={() => setOpenMove((v) => !v)}
                className="flex items-center justify-center gap-1 rounded-lg border border-sunu-line px-3 py-1.5 text-xs font-semibold text-sunu-ink/70 hover:border-sunu-green hover:text-sunu-green"
              >
                <CalendarClock className="size-3.5" /> {t("appt.move")}
              </button>
            )}
            {onCancel && active && appt.can_cancel && (
              <button
                onClick={() => (appt.series ? setOpenCancel((v) => !v) : onCancel("one"))}
                className="flex items-center justify-center gap-1 rounded-lg border border-sunu-line px-3 py-1.5 text-xs font-semibold text-sunu-ink/70 hover:border-red-300 hover:text-red-600"
              >
                <X className="size-3.5" /> {t("appt.cancel")}
              </button>
            )}
          </div>
          {openCancel && onCancel && (
            <div className="flex flex-col gap-1.5 md:items-end">
              <button
                onClick={() => {
                  setOpenCancel(false);
                  onCancel("one");
                }}
                className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"
              >
                {t("appt.cancelOne")}
              </button>
              <button
                onClick={() => {
                  setOpenCancel(false);
                  onCancel("series");
                }}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
              >
                {t("appt.cancelSeries")}
              </button>
            </div>
          )}
          {onReview && appt.status === "completed" && !appt.has_review && (
            <>
              {!openReview ? (
                <button
                  onClick={() => setOpenReview(true)}
                  className="flex items-center justify-center gap-1 rounded-lg border border-sunu-line px-3 py-1.5 text-xs font-semibold text-sunu-ink/70"
                >
                  <Star className="size-3.5" /> {t("appt.review")}
                </button>
              ) : (
                <div className="w-full rounded-lg md:min-w-64 border border-sunu-line p-3">
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button key={n} aria-label={`${n} étoiles`} onClick={() => setRating(n)}>
                        <Star
                          className={`size-5 ${n <= rating ? "fill-amber-400 text-amber-400" : "text-sunu-line"}`}
                        />
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Votre expérience (optionnel)"
                    className="mt-2 w-full rounded-md border border-sunu-line p-2 text-xs"
                  />
                  <button
                    onClick={() => {
                      onReview(rating, comment || undefined);
                      setOpenReview(false);
                    }}
                    className="mt-2 w-full rounded-md bg-sunu-green px-3 py-2 text-xs font-semibold text-white"
                  >
                    Publier l'avis
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      {openMove && onMoved && (
        <ReschedulePicker
          appt={appt}
          onDone={() => {
            setOpenMove(false);
            onMoved();
          }}
        />
      )}
    </div>
  );
}

function ReschedulePicker({ appt, onDone }: { appt: Appt; onDone: () => void }) {
  const { t } = useI18n();
  const [slot, setSlot] = useState<string | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["reschedule-slots", appt.id],
    queryFn: () =>
      listDoctorSlots({
        data: {
          doctor_id: appt.doctor_id,
          days: 30,
          duration_minutes: appt.duration_minutes,
          ignore_appointment_id: appt.id,
          mode: appt.mode === "home_visit" ? "home_visit" : undefined,
        },
      }),
  });
  const move = useMutation({
    mutationFn: () => rescheduleAppointment({ data: { id: appt.id, scheduled_at: slot ?? "" } }),
    onSuccess: () => {
      toast.success(t("appt.moved"));
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });
  const slots = data?.slots ?? [];
  return (
    <div className="mt-4 border-t border-sunu-line pt-4">
      <p className="mb-2 text-xs font-bold uppercase tracking-wider text-sunu-ink/50">
        {t("appt.pickNew")}
      </p>
      {isLoading ? (
        <Loader2 className="mx-auto size-5 animate-spin text-sunu-green" />
      ) : slots.length === 0 ? (
        <p className="text-sm text-sunu-ink/60">{t("book.noSlots")}</p>
      ) : (
        <div className="grid max-h-48 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-4">
          {slots.map((s) => (
            <button
              key={s.iso}
              onClick={() => setSlot(s.iso)}
              className={`rounded-lg border px-2 py-2 text-xs font-medium ${slot === s.iso ? "border-sunu-green bg-sunu-green text-white" : "border-sunu-line text-sunu-ink/80 hover:border-sunu-green"}`}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
      <button
        disabled={!slot || move.isPending}
        onClick={() => move.mutate()}
        className="mt-3 rounded-lg bg-sunu-green px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
      >
        {t("appt.move")}
      </button>
    </div>
  );
}

const RELATIONSHIPS = [
  { value: "enfant", label: "Enfant" },
  { value: "conjoint", label: "Conjoint(e)" },
  { value: "parent", label: "Parent" },
  { value: "autre", label: "Autre" },
] as const;

function RelativesPanel() {
  const qc = useQueryClient();
  const { t } = useI18n();
  const { data: relatives } = useSuspenseQuery(relativesQO);
  const [form, setForm] = useState<{
    full_name: string;
    relationship: (typeof RELATIONSHIPS)[number]["value"];
    birth_date: string;
    sex: "F" | "M" | "";
  }>({
    full_name: "",
    relationship: "enfant",
    birth_date: "",
    sex: "",
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["my-relatives"] });
  const add = useMutation({
    mutationFn: () => addRelative({ data: { ...form, birth_date: form.birth_date || undefined } }),
    onSuccess: () => {
      setForm({ full_name: "", relationship: "enfant", birth_date: "", sex: "" });
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: (id: string) => deleteRelative({ data: { id } }),
    onSuccess: refresh,
    onError: (e) => toast.error(e.message),
  });

  return (
    <section
      id="proches"
      className="scroll-mt-24 rounded-2xl border border-sunu-line bg-sunu-card p-5"
    >
      <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-sunu-ink/50">
        <Users className="size-4" /> {t("space.relatives")}
      </h2>
      <p className="mt-1 text-xs text-sunu-ink/50">
        Prenez rendez-vous pour vos enfants ou vos parents depuis votre compte.
      </p>
      <div className="mt-3 grid gap-2">
        {relatives.map((r) => (
          <div
            key={r.id}
            className="flex items-center justify-between rounded-lg bg-sunu-surface px-3 py-2 text-sm"
          >
            <span>
              <b className="text-sunu-dark">{r.full_name}</b>{" "}
              <span className="text-xs text-sunu-ink/50">
                · {RELATIONSHIPS.find((x) => x.value === r.relationship)?.label ?? r.relationship}
                {r.birth_date ? ` · né(e) le ${formatDate(r.birth_date)}` : ""}
                {r.sex ? ` · ${r.sex === "F" ? "fille / femme" : "garçon / homme"}` : ""}
              </span>
            </span>
            <button
              onClick={() => del.mutate(r.id)}
              className="text-sunu-ink/40 hover:text-red-600"
              aria-label={`Retirer ${r.full_name}`}
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          add.mutate();
        }}
        className="mt-4 grid gap-2 border-t border-sunu-line pt-4"
      >
        <input
          required
          minLength={2}
          value={form.full_name}
          onChange={(e) => setForm({ ...form, full_name: e.target.value })}
          placeholder="Prénom et nom"
          className="rounded-lg border border-sunu-line px-3 py-2 text-sm outline-none focus:border-sunu-green"
        />
        <div className="grid grid-cols-2 gap-2">
          <select
            aria-label="Lien"
            value={form.relationship}
            onChange={(e) =>
              setForm({ ...form, relationship: e.target.value as typeof form.relationship })
            }
            className="rounded-lg border border-sunu-line bg-sunu-card px-3 py-2 text-sm outline-none focus:border-sunu-green"
          >
            {RELATIONSHIPS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <input
            type="date"
            aria-label="Date de naissance"
            value={form.birth_date}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setForm({ ...form, birth_date: e.target.value })}
            className="col-span-2 row-start-2 rounded-lg border border-sunu-line bg-sunu-card px-3 py-2 text-sm outline-none focus:border-sunu-green"
          />
          <select
            aria-label="Sexe"
            value={form.sex}
            onChange={(e) => setForm({ ...form, sex: e.target.value as typeof form.sex })}
            className="rounded-lg border border-sunu-line bg-sunu-card px-3 py-2 text-sm outline-none focus:border-sunu-green"
          >
            <option value="">Sexe</option>
            <option value="F">Féminin</option>
            <option value="M">Masculin</option>
          </select>
        </div>
        <button
          disabled={add.isPending}
          className="flex items-center justify-center gap-1 rounded-lg bg-sunu-green px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
        >
          <Plus className="size-3.5" /> {t("book.addRelative")}
        </button>
      </form>
    </section>
  );
}

function WaitlistPanel() {
  const qc = useQueryClient();
  const { t } = useI18n();
  const { data } = useQuery(waitlistQO);
  const leave = useMutation({
    mutationFn: (doctorId: string) => leaveWaitlist({ data: { doctor_id: doctorId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-waitlist"] }),
    onError: (e) => toast.error(e.message),
  });
  if (!data?.length) return null;
  return (
    <section className="rounded-2xl border border-sunu-line bg-sunu-card p-5">
      <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-sunu-ink/50">
        <BellRing className="size-4" /> {t("space.waitlist")}
      </h2>
      <div className="mt-3 grid gap-2">
        {data.map((w) => (
          <div
            key={w.id}
            className="flex items-center justify-between gap-2 rounded-lg bg-sunu-surface px-3 py-2 text-sm"
          >
            <Link to="/medecins/$id" params={{ id: w.doctor_id }} className="min-w-0">
              <b className="text-sunu-dark">{w.doctor?.full_name}</b>
              <span className="block text-xs text-sunu-ink/50">
                {w.doctor?.specialty?.name} · {w.doctor?.city}
              </span>
            </Link>
            <button
              onClick={() => leave.mutate(w.doctor_id)}
              className="shrink-0 text-xs text-sunu-ink/50 hover:text-red-600"
            >
              {t("wait.leave")}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
