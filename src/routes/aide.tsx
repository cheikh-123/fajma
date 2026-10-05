import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  LifeBuoy,
  Loader2,
  Phone,
  Search,
  Send,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useMe } from "@/api/auth";
import {
  SUPPORT_TOPICS,
  listMySupportRequests,
  sendSupportRequest,
  type SupportTopic,
} from "@/api/support";
import { formatDateTime } from "@/lib/datetime";
import { ThemeToggle } from "@/lib/theme";
import { FajmaMark } from "@/components/FajmaMark";

export const Route = createFileRoute("/aide")({
  head: () => ({
    meta: [
      { title: "Aide et contact — Fajma" },
      {
        name: "description",
        content:
          "Questions fréquentes sur Fajma (rendez-vous, paiement, ordonnances, compte, espace professionnel) et formulaire pour contacter l'équipe.",
      },
    ],
  }),
  component: HelpPage,
});

type Faq = { q: string; a: ReactNode; keywords?: string };
type Section = { id: string; title: string; items: Faq[] };

const L = ({ to, children }: { to: string; children: ReactNode }) => (
  <Link to={to} className="font-semibold text-sunu-green hover:underline">
    {children}
  </Link>
);

const SECTIONS: Section[] = [
  {
    id: "patients",
    title: "Patients",
    items: [
      {
        q: "Comment prendre rendez-vous ?",
        a: (
          <>
            Cherchez un médecin sur <L to="/medecins">Trouver un médecin</L> (spécialité, quartier,
            disponibilité), ouvrez sa fiche, choisissez le motif, le mode (cabinet, vidéo ou
            domicile si le médecin le propose) puis un créneau. Dès que le rendez-vous est confirmé,
            vous recevez un SMS, puis un rappel avant le rendez-vous.
          </>
        ),
        keywords: "réserver rdv créneau",
      },
      {
        q: "Comment annuler ou déplacer un rendez-vous ?",
        a: (
          <>
            Dans <L to="/mon-espace">Mon espace</L>, utilisez « Déplacer » ou « Annuler » sur le
            rendez-vous. C'est possible en ligne jusqu'au délai fixé par le médecin (indiqué sur sa
            fiche) ; passé ce délai, appelez directement le cabinet.
          </>
        ),
        keywords: "annulation report modifier",
      },
      {
        q: "Je n'arrive pas à trouver de créneau libre",
        a: "Élargissez la recherche (« Cette semaine », quartier voisin, téléconsultation) ou inscrivez-vous sur la liste d'attente depuis la fiche du médecin : vous êtes prévenu par SMS dès qu'un créneau se libère.",
        keywords: "complet disponible liste d'attente",
      },
      {
        q: "Puis-je prendre rendez-vous pour mon enfant ou un parent ?",
        a: (
          <>
            Oui. Ajoutez-le une fois dans <L to="/mon-espace">Mon espace</L>, rubrique « Mes proches
            », puis choisissez-le au moment de réserver. Ordonnances et comptes-rendus sont rangés à
            son nom dans votre dossier.
          </>
        ),
        keywords: "enfant proche famille",
      },
      {
        q: "Comment se passe une téléconsultation ?",
        a: "Réservez un créneau « Vidéo ». À l'heure du rendez-vous, cliquez sur « Rejoindre » dans Mon espace : la consultation s'ouvre dans le navigateur, sans application à installer. Prévoyez une bonne connexion et un endroit calme.",
        keywords: "vidéo visio distance",
      },
      {
        q: "Où trouver mes ordonnances et mes résultats d'analyses ?",
        a: (
          <>
            Dans <L to="/dossier">Mon dossier</L>. Vous pouvez télécharger l'ordonnance en PDF,
            l'envoyer à une pharmacie partenaire en un clic, et suivre la préparation. Le pharmacien
            vérifie son authenticité grâce au QR code.
          </>
        ),
        keywords: "ordonnance pharmacie résultat laboratoire pdf",
      },
    ],
  },
  {
    id: "paiement",
    title: "Paiement et remboursement",
    items: [
      {
        q: "Comment payer ma consultation ?",
        a: "En ligne par Wave, Orange Money, Free Money ou carte bancaire, ou directement au cabinet selon le médecin. Un reçu est disponible dans Mon espace après paiement.",
        keywords: "wave orange money payer reçu",
      },
      {
        q: "Je suis remboursé si le rendez-vous est annulé ?",
        a: "Oui : un rendez-vous payé en ligne puis annulé (par vous dans le délai autorisé, ou par le médecin) est remboursé en totalité, frais compris. Le remboursement est suivi dans Mon espace.",
        keywords: "remboursement annulation argent",
      },
      {
        q: "Mon assurance ou mon IPM est-elle acceptée ?",
        a: "La fiche de chaque médecin indique les organismes acceptés et s'il pratique le tiers payant (vous ne réglez alors que votre part). Sinon, le reçu vous permet de demander le remboursement à votre organisme.",
        keywords: "ipm mutuelle assurance tiers payant",
      },
    ],
  },
  {
    id: "compte",
    title: "Compte et sécurité",
    items: [
      {
        q: "Je ne reçois pas le code SMS",
        a: "Vérifiez le numéro saisi et votre réseau, puis patientez une minute. Par sécurité, 3 codes au plus peuvent être demandés en 10 minutes : au-delà, attendez un peu avant de réessayer. Vous pouvez aussi vous connecter par email.",
        keywords: "sms code connexion otp",
      },
      {
        q: "J'ai perdu mon téléphone (double authentification)",
        a: "Connectez-vous avec l'un de vos codes de secours (remis lors de l'activation). Si vous n'en avez plus, contactez l'équipe Fajma avec le formulaire ci-dessous : après vérification de votre identité, la double authentification est réinitialisée.",
        keywords: "2fa authentification téléphone perdu codes de secours",
      },
      {
        q: "J'ai reçu une alerte « Nouvelle connexion à votre compte »",
        a: "Fajma vous prévient à chaque connexion depuis un appareil jamais utilisé. Si ce n'était pas vous, changez votre mot de passe tout de suite et contactez-nous.",
        keywords: "alerte sécurité piratage connexion",
      },
      {
        q: "Qui peut voir mon dossier médical ?",
        a: (
          <>
            Vous, et les médecins avec qui vous avez un rendez-vous confirmé ; un document n'est
            visible par un autre médecin que si vous le partagez. Chaque consultation de votre
            dossier est inscrite dans « Qui a consulté mon dossier » (
            <L to="/dossier">Mon dossier</L>
            ).
          </>
        ),
        keywords: "confidentialité secret médical accès",
      },
      {
        q: "Comment récupérer ou supprimer mes données ?",
        a: (
          <>
            Dans <L to="/dossier">Mon dossier</L>, rubrique « Mes données personnelles » :
            téléchargement de toutes vos données, ou suppression du compte. Voir aussi la{" "}
            <L to="/confidentialite">politique de confidentialité</L>.
          </>
        ),
        keywords: "rgpd cdp suppression export données",
      },
    ],
  },
  {
    id: "pro",
    title: "Médecins et professionnels",
    items: [
      {
        q: "Comment inscrire mon cabinet ?",
        a: (
          <>
            Créez votre compte puis votre fiche depuis l'<L to="/pro">espace médecin</L>. Un guide
            de démarrage vous accompagne : fiche, justificatif d'inscription à l'Ordre, emploi du
            temps, en-tête d'ordonnance. Votre fiche est publiée après vérification de votre
            justificatif par l'équipe Fajma. Voir les <L to="/tarifs">tarifs</L>.
          </>
        ),
        keywords: "inscription médecin cabinet ordre",
      },
      {
        q: "Comment définir mes horaires de consultation ?",
        a: "Espace médecin, onglet « Emploi du temps » : ajoutez vos plages (plusieurs jours d'un coup), cliquez sur une plage pour la modifier ou la supprimer, et ajoutez vos absences. L'aperçu montre les créneaux proposés aux patients.",
        keywords: "horaires disponibilités emploi du temps agenda congés",
      },
      {
        q: "Comment délivrer une ordonnance ou un arrêt de travail ?",
        a: "Complétez une fois l'en-tête (n° d'Ordre, cabinet, signature) dans l'onglet « Ordonnances ». Ensuite, depuis la consultation dans « Rendez-vous », rédigez le compte-rendu et l'ordonnance, ou « Rédiger un document » pour un certificat ou un arrêt de travail.",
        keywords: "ordonnance certificat arrêt signature",
      },
      {
        q: "Ma secrétaire peut-elle gérer mon agenda ?",
        a: "Oui. Onglet « Secrétariat et remplacements » : saisissez l'email de son compte Fajma. Elle prend et déplace les rendez-vous (y compris pour des patients sans compte) mais ne voit pas vos dossiers médicaux.",
        keywords: "secrétaire secrétariat assistante",
      },
      {
        q: "Quand suis-je payé ?",
        a: "Les consultations réglées en ligne s'ajoutent à votre solde, commission déduite. Demandez un virement dès 5 000 F depuis l'onglet « Finances ». Les paiements en espèces restent entre vous et le patient.",
        keywords: "virement solde commission paiement",
      },
      {
        q: "Pharmacie ou laboratoire : comment rejoindre Fajma ?",
        a: "Créez un compte avec l'email professionnel de l'établissement, puis écrivez-nous avec le formulaire ci-dessous (sujet « Espace professionnel ») : après vérification de l'autorisation d'exercer, l'équipe Fajma rattache votre compte à votre officine ou à votre laboratoire.",
        keywords: "pharmacie laboratoire partenaire",
      },
    ],
  },
];

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join(" ");
  if (node && typeof node === "object" && "props" in node)
    return textOf((node as { props: { children?: ReactNode } }).props.children);
  return "";
}

function HelpPage() {
  const [query, setQuery] = useState("");
  const q = norm(query.trim());
  const sections = SECTIONS.map((s) => ({
    ...s,
    items: q
      ? s.items.filter((f) => norm(`${f.q} ${textOf(f.a)} ${f.keywords ?? ""}`).includes(q))
      : s.items,
  })).filter((s) => s.items.length);

  return (
    <div className="min-h-screen bg-sunu-surface">
      <header className="border-b border-sunu-line bg-sunu-card">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <FajmaMark className="size-8" />
            <span className="text-xl font-bold text-sunu-green">Fajma</span>
          </Link>
          <ThemeToggle className="ml-auto mr-3" />
          <Link
            to="/"
            className="flex items-center gap-1 text-sm font-medium text-sunu-ink/60 hover:text-sunu-green"
          >
            <ArrowLeft className="size-4" /> <span className="hidden sm:inline">Accueil</span>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-sunu-green">
          <LifeBuoy className="size-4" /> Aide et contact
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-sunu-dark md:text-4xl">
          Comment pouvons-nous vous aider ?
        </h1>

        <div
          role="note"
          className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl border border-red-300 bg-red-50 px-5 py-4 text-sm text-red-900"
        >
          <span className="font-bold">Urgence médicale ?</span>
          <a href="tel:1515" className="flex items-center gap-1.5 font-semibold underline">
            <Phone className="size-4" /> SAMU 1515
          </a>
          <a href="tel:18" className="flex items-center gap-1.5 font-semibold underline">
            <Phone className="size-4" /> Sapeurs-pompiers 18
          </a>
          <span className="text-xs text-red-800">
            Fajma ne traite pas les urgences : appelez directement ces numéros.
          </span>
        </div>

        <label className="relative mt-6 block">
          <Search className="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-sunu-ink/40" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher : annuler, code SMS, ordonnance, remboursement…"
            aria-label="Rechercher dans l'aide"
            className="w-full rounded-2xl border border-sunu-line bg-sunu-card py-3.5 pl-12 pr-4 text-sm outline-none focus:border-sunu-green"
          />
        </label>

        {!q && (
          <nav aria-label="Rubriques" className="mt-4 flex flex-wrap gap-2">
            {SECTIONS.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="rounded-full border border-sunu-line bg-sunu-card px-3.5 py-1.5 text-sm font-semibold text-sunu-ink/70 hover:border-sunu-green hover:text-sunu-green"
              >
                {s.title}
              </a>
            ))}
            <a
              href="#contact"
              className="rounded-full bg-sunu-green px-3.5 py-1.5 text-sm font-semibold text-white"
            >
              Nous écrire
            </a>
          </nav>
        )}

        <div className="mt-8 space-y-10">
          {sections.length === 0 && (
            <p className="rounded-2xl border border-dashed border-sunu-line bg-sunu-card p-8 text-center text-sm text-sunu-ink/60">
              Aucune réponse ne correspond à « {query} ». Écrivez-nous ci-dessous : nous vous
              répondrons.
            </p>
          )}
          {sections.map((s) => (
            <section key={s.id} id={s.id} className="scroll-mt-6">
              <h2 className="text-lg font-bold text-sunu-dark">{s.title}</h2>
              <div className="stagger mt-3 divide-y divide-sunu-line overflow-hidden rounded-2xl border border-sunu-line bg-sunu-card">
                {s.items.map((f) => (
                  <details key={f.q} className="group" open={Boolean(q)}>
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-sm font-semibold text-sunu-dark hover:text-sunu-green">
                      {f.q}
                      <ChevronDown className="size-4 text-sunu-ink/40 transition group-open:rotate-180" />
                    </summary>
                    <div className="px-5 pb-5 text-sm leading-relaxed text-sunu-ink/70">{f.a}</div>
                  </details>
                ))}
              </div>
            </section>
          ))}
        </div>

        <ContactForm />
      </main>
    </div>
  );
}

function ContactForm() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: "",
    contact: "",
    topic: "" as SupportTopic | "",
    message: "",
    website: "",
  });
  const [sent, setSent] = useState(false);
  const send = useMutation({
    mutationFn: () =>
      sendSupportRequest({
        name: form.name || me?.full_name || "",
        contact: form.contact || me?.email || me?.phone || "",
        topic: form.topic as SupportTopic,
        message: form.message,
        website: form.website,
      }),
    onSuccess: () => {
      setSent(true);
      qc.invalidateQueries({ queryKey: ["my-support"] });
    },
    onError: (e) => toast.error(e.message),
  });
  // Suivi : les demandes déjà envoyées depuis ce compte.
  const { data: mine } = useQuery({
    queryKey: ["my-support"],
    queryFn: listMySupportRequests,
    enabled: Boolean(me),
  });
  const input =
    "w-full rounded-lg border border-sunu-line bg-sunu-card px-3 py-2.5 text-sm outline-none focus:border-sunu-green";

  return (
    <section
      id="contact"
      className="mt-12 scroll-mt-6 rounded-3xl border border-sunu-line bg-sunu-card p-6 sm:p-8"
    >
      <h2 className="text-xl font-bold text-sunu-dark">Vous n'avez pas trouvé la réponse ?</h2>
      <p className="mt-1 text-sm text-sunu-ink/60">
        Écrivez à l'équipe Fajma : nous vous répondons par email ou par téléphone, les jours ouvrés.
      </p>
      {sent ? (
        <div className="mt-6 flex items-start gap-3 rounded-2xl bg-sunu-green-soft p-5 text-sm text-sunu-dark">
          <CheckCircle2 className="mt-0.5 size-5 text-sunu-green" />
          <div>
            <p className="font-bold">Message envoyé, merci.</p>
            <p className="mt-1 text-sunu-ink/70">
              Nous revenons vers vous à l'adresse ou au numéro indiqué.
            </p>
          </div>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!form.topic) return toast.error("Choisissez le sujet de votre demande");
            send.mutate();
          }}
          className="mt-6 grid gap-3 sm:grid-cols-2"
        >
          <label className="grid gap-1 text-xs font-semibold text-sunu-ink/60">
            Votre nom
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder={me?.full_name ?? "Prénom et nom"}
              required={!me}
              className={input}
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-sunu-ink/60">
            Email ou téléphone pour vous répondre
            <input
              value={form.contact}
              onChange={(e) => setForm({ ...form, contact: e.target.value })}
              placeholder={me?.email ?? me?.phone ?? "77 123 45 67 ou vous@exemple.sn"}
              required={!me}
              className={input}
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-sunu-ink/60 sm:col-span-2">
            Sujet
            <select
              value={form.topic}
              onChange={(e) => setForm({ ...form, topic: e.target.value as SupportTopic })}
              className={input}
            >
              <option value="">Choisir…</option>
              {SUPPORT_TOPICS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-semibold text-sunu-ink/60 sm:col-span-2">
            Votre message
            <textarea
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
              rows={5}
              minLength={10}
              maxLength={3000}
              required
              placeholder="Décrivez votre problème : quelle page, quel message d'erreur…"
              className={input}
            />
          </label>
          {/* Champ invisible : seuls les robots le remplissent. */}
          <input
            tabIndex={-1}
            autoComplete="off"
            aria-hidden
            value={form.website}
            onChange={(e) => setForm({ ...form, website: e.target.value })}
            className="hidden"
          />
          <p className="text-xs text-sunu-ink/50 sm:col-span-2">
            N'indiquez pas d'informations médicales détaillées : pour une question sur votre santé,
            consultez un médecin.
          </p>
          <button
            type="submit"
            disabled={send.isPending}
            className="flex items-center justify-center gap-2 rounded-xl bg-sunu-green px-5 py-3 text-sm font-bold text-white hover:bg-sunu-green/90 disabled:opacity-50 sm:col-span-2 sm:justify-self-start"
          >
            {send.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
            Envoyer
          </button>
        </form>
      )}
      {mine && mine.length > 0 && (
        <div className="mt-8 border-t border-sunu-line pt-5">
          <h3 className="text-sm font-bold text-sunu-dark">Mes demandes</h3>
          <ul className="mt-2 divide-y divide-sunu-line text-sm">
            {mine.map((r) => (
              <li key={r.id} className="flex flex-wrap items-start justify-between gap-2 py-2.5">
                <div className="min-w-0">
                  <p className="font-semibold text-sunu-dark">{r.topic_label}</p>
                  <p className="line-clamp-2 text-xs text-sunu-ink/60">{r.message}</p>
                  <p className="text-xs text-sunu-ink/45">
                    Envoyée le{" "}
                    {formatDateTime(r.created_at, { dateStyle: "short", timeStyle: "short" })}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${r.status === "open" ? "bg-amber-100 text-amber-800" : "bg-sunu-teal/15 text-sunu-teal"}`}
                >
                  {r.status === "open" ? "En cours" : "Traitée"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
