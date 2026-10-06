import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { CampaignHero } from "@/components/CampaignHero";
import { PartnersStrip } from "@/components/PartnersStrip";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getPublicStats,
  listDoctors,
  listPharmacies,
  listSpecialties,
  searchDoctors,
} from "@/api/directory";
import { SpecialtyIcon } from "@/components/SpecialtyIcon";
import { InteractiveMap } from "@/components/InteractiveMap";
import type { DoctorListItem } from "@/api/types";
import { formatDate, formatTime, startOfDakarDay } from "@/lib/datetime";
import { CityInput } from "@/components/CityInput";
import { LanguageSwitcher, useI18n } from "@/lib/i18n";
import { ThemeToggle } from "@/lib/theme";
import {
  ArrowRight,
  Baby,
  Bone,
  Brain,
  CalendarCheck,
  CheckCircle2,
  Eye,
  FileText,
  Heart,
  MapPin,
  Pill,
  Search,
  ShieldCheck,
  Star,
  Stethoscope,
  Video,
} from "lucide-react";
import doctorHero from "@/assets/fajma-medecins.jpg";
import medicalRecords from "@/assets/fajma-dossier.jpg";
import pharmacyImg from "@/assets/fajma-pharmacies.jpg";
import { FajmaMark } from "@/components/FajmaMark";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Fajma — Votre santé, simplifiée au Sénégal" },
      {
        name: "description",
        content:
          "Prenez rendez-vous avec des médecins vérifiés au Sénégal, téléconsultez et gérez votre dossier médical en toute sécurité. Wave, Orange Money acceptés.",
      },
      { property: "og:title", content: "Fajma — Votre santé, simplifiée" },
      {
        property: "og:description",
        content: "Trouver un médecin, téléconsulter et gérer son dossier médical au Sénégal.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Fajma — Votre santé, simplifiée" },
      {
        name: "twitter:description",
        content: "Trouvez un médecin, téléconsultez, gérez votre dossier médical au Sénégal.",
      },
    ],
  }),
  component: Landing,
});

const cities = [
  "Dakar",
  "Thiès",
  "Saint-Louis",
  "Rufisque",
  "Mbour",
  "Kaolack",
  "Ziguinchor",
  "Touba",
];

function Landing() {
  const { data: stats } = useQuery({ queryKey: ["public-stats"], queryFn: getPublicStats });
  // Toutes les spécialités du catalogue (serveur), avec le nombre de praticiens de chacune.
  const { data: specialties = [] } = useQuery({
    queryKey: ["specialties"],
    queryFn: listSpecialties,
  });
  // Carte interactive : médecins publiés (200 au plus) et pharmacies, à leur adresse.
  const { data: mapDoctors } = useQuery({
    queryKey: ["map-doctors"],
    queryFn: () => searchDoctors({ data: {}, limit: 200 }),
  });
  const { data: mapPharmacies } = useQuery({
    queryKey: ["map-pharmacies"],
    queryFn: () => listPharmacies(),
  });
  const { t } = useI18n();
  const navigate = useNavigate();
  const [what, setWhat] = useState("");
  const [where, setWhere] = useState("");
  function search(e?: React.FormEvent) {
    e?.preventDefault();
    navigate({
      to: "/medecins",
      search: { q: what.trim() || undefined, city: where.trim() || undefined },
    });
  }
  return (
    <div className="min-h-screen bg-sunu-card text-sunu-ink">
      {/* NAV */}
      <nav className="sticky top-0 z-40 border-b border-sunu-line bg-sunu-card/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <FajmaMark className="size-8" />
            <span className="text-xl font-bold tracking-tight text-sunu-green">Fajma</span>
          </Link>
          <div className="hidden items-center gap-6 text-sm font-medium text-sunu-ink/70 lg:flex">
            <Link to="/medecins" className="hover:text-sunu-green">
              {t("nav.find")}
            </Link>
            <a href="#teleconsult" className="hover:text-sunu-green">
              {t("nav.teleconsult")}
            </a>
            <Link to="/pharmacies" className="hover:text-sunu-green">
              {t("nav.pharmacies")}
            </Link>
            <Link to="/assistant" className="hover:text-sunu-green">
              {t("nav.assistant")}
            </Link>
            <Link to="/partenaires" className="hover:text-sunu-green">
              {t("nav.partners")}
            </Link>
            <Link to="/pro" className="hover:text-sunu-green">
              {t("nav.pros")}
            </Link>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <ThemeToggle />
            <LanguageSwitcher />
            <Link
              to="/pro"
              className="hidden text-sm font-semibold text-sunu-ink/80 hover:text-sunu-green sm:block"
            >
              {t("nav.imPro")}
            </Link>
            <Link
              to="/auth"
              className="whitespace-nowrap rounded-full bg-sunu-green px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-sunu-green/90 sm:px-5 sm:py-2.5"
            >
              {t("nav.login")}
            </Link>
          </div>
        </div>
      </nav>

      {/* CAMPAGNE SPONSORISÉE (invisible sans campagne validée) */}
      <CampaignHero />

      {/* HERO */}
      <section id="recherche" className="relative overflow-hidden bg-sunu-surface">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            backgroundImage:
              "radial-gradient(600px 300px at 20% 0%, color-mix(in oklab, var(--sunu-green) 10%, transparent), transparent), radial-gradient(500px 300px at 100% 20%, color-mix(in oklab, var(--sunu-gold) 18%, transparent), transparent)",
          }}
        />
        <div className="relative mx-auto max-w-7xl px-6 py-20 md:py-28">
          <div className="mx-auto max-w-3xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-sunu-line bg-sunu-card px-3 py-1 text-xs font-semibold text-sunu-green">
              {/* Étoile du drapeau */}
              <Star className="size-3.5 fill-sunu-gold text-sunu-gold-ink" />
              {t("home.badge")}
            </span>
            <h1 className="mt-6 text-4xl font-bold tracking-tight text-sunu-dark md:text-6xl">
              {t("home.title1")}{" "}
              <span className="text-sunu-green underline decoration-sunu-gold decoration-[6px] underline-offset-[10px] [text-decoration-skip-ink:none]">
                {t("home.title2")}
              </span>
              .
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-sunu-ink/60">
              {t("home.subtitle")}
            </p>
          </div>

          {/* Search bar */}
          <div className="mx-auto mt-12 max-w-4xl">
            <form
              onSubmit={search}
              className="flex flex-col gap-2 rounded-2xl border border-sunu-line bg-sunu-card p-2 shadow-sunu-soft md:flex-row"
            >
              <label className="flex flex-1 items-center gap-3 rounded-xl px-4 py-3 focus-within:bg-sunu-green-soft">
                <Stethoscope className="size-5 shrink-0 text-sunu-green" />
                <div className="flex flex-1 flex-col text-left">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-sunu-ink/40">
                    {t("home.what")}
                  </span>
                  <input
                    type="text"
                    value={what}
                    onChange={(e) => setWhat(e.target.value)}
                    placeholder={t("home.whatPh")}
                    className="w-full bg-transparent text-sm text-sunu-ink outline-none placeholder:text-sunu-ink/30"
                  />
                </div>
              </label>
              <div className="hidden w-px bg-sunu-line md:block" />
              <div className="flex flex-1 flex-col rounded-xl px-4 py-3 text-left focus-within:bg-sunu-green-soft">
                <span className="pl-6 text-[10px] font-bold uppercase tracking-wider text-sunu-ink/40">
                  {t("home.where")}
                </span>
                <CityInput
                  value={where}
                  onChange={setWhere}
                  placeholder={t("home.wherePh")}
                  onPick={(name) =>
                    navigate({
                      to: "/medecins",
                      search: { q: what.trim() || undefined, city: name },
                    })
                  }
                  onNearMe={(lat, lng) =>
                    navigate({
                      to: "/medecins",
                      search: {
                        q: what.trim() || undefined,
                        lat: Number(lat.toFixed(4)),
                        lng: Number(lng.toFixed(4)),
                      },
                    })
                  }
                />
              </div>
              <button
                type="submit"
                className="flex items-center justify-center gap-2 rounded-xl bg-sunu-green px-8 py-4 text-sm font-bold text-white transition hover:bg-sunu-green/90"
              >
                <Search className="size-4" />
                {t("home.search")}
              </button>
            </form>

            {/* Trust strip */}
            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs font-medium text-sunu-ink/60">
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="size-4 text-sunu-teal" />
                {t("home.trust1")}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="size-4 text-sunu-teal" />
                {t("home.trust2")}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="size-4 text-sunu-teal" />
                {t("home.trust3")}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* PARTENAIRES (invisible tant qu'aucun partenaire n'est public) */}
      <PartnersStrip />

      {/* SPECIALTIES */}
      <section className="reveal mx-auto max-w-7xl px-6 py-20">
        <div className="mb-10 flex items-end justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-sunu-green">
              Spécialités
            </p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-sunu-dark md:text-4xl">
              Un médecin pour chaque besoin
            </h2>
          </div>
          <Link
            to="/specialites"
            className="hidden items-center gap-1 text-sm font-semibold text-sunu-green hover:underline md:inline-flex"
          >
            Voir toutes les spécialités <ArrowRight className="size-4" />
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {[...specialties]
            // Spécialités déjà disponibles d'abord (plus de praticiens en tête), puis les autres par ordre alphabétique.
            .sort((a, b) => (stats?.by_specialty[b.slug] ?? 0) - (stats?.by_specialty[a.slug] ?? 0))
            .map((s) => {
              const count = stats?.by_specialty[s.slug] ?? 0;
              return (
                <Link
                  key={s.slug}
                  to="/specialites/$slug"
                  params={{ slug: s.slug }}
                  className="group flex min-w-0 items-center gap-3 rounded-2xl border border-sunu-line bg-sunu-card p-3.5 text-left transition hover:-translate-y-0.5 hover:border-sunu-green/30 hover:shadow-sunu-card"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-sunu-green-soft text-sunu-green transition group-hover:bg-sunu-green group-hover:text-white">
                    <SpecialtyIcon name={s.icon} className="size-[18px]" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-bold leading-tight text-sunu-dark">
                      {s.name}
                    </span>
                    <span className="mt-0.5 block text-xs text-sunu-ink/50">
                      {count > 0 ? `${count} praticien${count > 1 ? "s" : ""}` : "Bientôt"}
                    </span>
                  </span>
                </Link>
              );
            })}
        </div>
      </section>

      {/* FEATURES */}
      <section className="reveal bg-sunu-surface py-24">
        <div className="mx-auto max-w-7xl px-6">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-bold uppercase tracking-widest text-sunu-green">
              Un écosystème complet
            </p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-sunu-dark md:text-4xl">
              Tout ce qu'il faut pour bien se soigner
            </h2>
          </div>

          <div className="mt-16 grid gap-10 md:grid-cols-3">
            <FeatureCard
              image={doctorHero}
              alt="Médecin en blouse blanche avec un stéthoscope, dans le couloir d'une clinique"
              tag="Médecins vérifiés"
              title="Des spécialistes de confiance"
              body="Consultez des professionnels reconnus, diplômes vérifiés, avis patients transparents."
              icon={Stethoscope}
            />
            <FeatureCard
              image={medicalRecords}
              alt="Dossier médical dans l'application Fajma : comptes-rendus et ordonnances, envoi à une pharmacie de Dakar"
              tag="Dossier médical"
              title="Votre historique centralisé"
              body="Ordonnances, analyses et comptes-rendus dans un espace sécurisé, partagé uniquement avec vos médecins."
              icon={FileText}
            />
            <FeatureCard
              image={pharmacyImg}
              alt="Espace pharmacie de Fajma : ordonnances reçues par une pharmacie du Plateau, à Dakar"
              tag="Pharmacies partenaires"
              title="Ordonnances instantanées"
              body="Envoyez vos prescriptions directement aux pharmacies partenaires. Notification quand c'est prêt."
              icon={Pill}
            />
          </div>
        </div>
      </section>

      {/* DOCTORS DISPO */}
      <section id="rdv" className="reveal mx-auto max-w-7xl px-6 py-24">
        <div className="mb-10 flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-sunu-green">
              Disponibles cette semaine
            </p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-sunu-dark md:text-4xl">
              Réservez en moins de 60 secondes
            </h2>
          </div>
          <Link
            to="/medecins"
            className="inline-flex items-center gap-1 text-sm font-semibold text-sunu-green hover:underline"
          >
            Voir tous les médecins <ArrowRight className="size-4" />
          </Link>
        </div>

        <AvailableDoctors />
      </section>

      {/* TELECONSULT */}
      <section id="teleconsult" className="reveal mx-auto max-w-7xl px-6 pb-24">
        <div className="grid items-center gap-10 rounded-[2rem] border border-sunu-line bg-gradient-to-br from-sunu-green-soft via-sunu-card to-sunu-card p-8 md:grid-cols-2 md:p-14">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-sunu-card px-3 py-1 text-xs font-bold uppercase tracking-widest text-sunu-teal ring-1 ring-sunu-line">
              <Video className="size-3.5" /> Téléconsultation HD
            </p>
            <h2 className="mt-5 text-3xl font-bold tracking-tight text-sunu-dark md:text-4xl">
              Consultez un médecin depuis chez vous
            </h2>
            <p className="mt-4 text-base leading-relaxed text-sunu-ink/60">
              Vidéo HD, chat sécurisé, partage d'ordonnances et de documents. Sans déplacement, sans
              attente, en Wolof ou Français.
            </p>
            <ul className="mt-6 space-y-3 text-sm">
              {[
                "Vidéo sécurisée, sans application à installer",
                "Ordonnance électronique envoyée en direct",
                "Paiement Wave, Orange Money ou carte",
              ].map((t) => (
                <li key={t} className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-sunu-teal" />
                  <span className="text-sunu-ink/80">{t}</span>
                </li>
              ))}
            </ul>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/medecins"
                search={{ tele: "1" }}
                className="rounded-xl bg-sunu-green px-6 py-3 text-sm font-bold text-white hover:bg-sunu-green/90"
              >
                Démarrer une consultation
              </Link>
              <details className="group w-full">
                <summary className="inline-flex cursor-pointer list-none rounded-xl border border-sunu-line bg-sunu-card px-6 py-3 text-sm font-bold text-sunu-dark hover:bg-sunu-surface">
                  Comment ça marche ?
                </summary>
                <ol className="mt-4 space-y-2 text-sm text-sunu-ink/70">
                  {[
                    "Choisissez un médecin qui propose la vidéo et réservez un créneau « Vidéo ».",
                    "Réglez par Wave, Orange Money ou carte si le médecin le demande ; vous recevez une confirmation par SMS.",
                    "À l'heure du rendez-vous, cliquez sur « Rejoindre » dans votre espace : pas d'application à installer.",
                    "Ordonnance et compte-rendu arrivent dans votre dossier ; envoyez l'ordonnance à votre pharmacie en un clic.",
                  ].map((step, i) => (
                    <li key={step} className="flex gap-3">
                      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-sunu-green text-xs font-bold text-white">
                        {i + 1}
                      </span>
                      {step}
                    </li>
                  ))}
                </ol>
              </details>
            </div>
          </div>
          <div className="relative">
            <div className="overflow-hidden rounded-3xl border border-sunu-line shadow-sunu-card">
              <img
                src={doctorHero}
                alt="Médecin en téléconsultation"
                width={1200}
                height={900}
                loading="lazy"
                className="aspect-[4/3] w-full object-cover"
              />
            </div>
            <div className="absolute -bottom-6 -left-4 rounded-2xl border border-sunu-line bg-sunu-card p-4 shadow-sunu-card md:-left-6">
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-full bg-sunu-teal/10 text-sunu-teal">
                  <CalendarCheck className="size-5" />
                </span>
                <div>
                  <p className="text-xs text-sunu-ink/50">RDV confirmé</p>
                  <p className="text-sm font-bold text-sunu-dark">Aujourd'hui · 15h30</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* MAP / COUVERTURE */}
      <section className="reveal bg-sunu-surface py-24">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid items-center gap-12 md:grid-cols-2">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-sunu-green">
                Couverture Sénégal
              </p>
              <h2 className="mt-2 text-3xl font-bold tracking-tight text-sunu-dark md:text-4xl">
                Une carte, tous les soignants près de vous
              </h2>
              <p className="mt-4 text-base leading-relaxed text-sunu-ink/60">
                Médecins, cliniques, hôpitaux et pharmacies géolocalisés. Filtrez par disponibilité,
                spécialité, langue ou tarif.
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                {cities.map((c) => (
                  <Link
                    key={c}
                    to="/medecins"
                    search={{ city: c }}
                    className="inline-flex items-center gap-1.5 rounded-full border border-sunu-line bg-sunu-card px-3 py-1.5 text-xs font-semibold text-sunu-ink/70 hover:border-sunu-green hover:text-sunu-green"
                  >
                    <span className="size-1.5 rounded-full bg-sunu-teal" />
                    {c}
                  </Link>
                ))}
              </div>
            </div>
            <div className="rounded-3xl border border-sunu-line bg-sunu-card p-4 shadow-sunu-card sm:p-6">
              <InteractiveMap doctors={mapDoctors?.data ?? []} pharmacies={mapPharmacies ?? []} />
            </div>
          </div>
        </div>
      </section>

      {/* PROS */}
      <section id="pros" className="reveal mx-auto max-w-7xl px-6 py-24">
        <div className="overflow-hidden rounded-[2rem] bg-sunu-night p-8 text-white md:p-14">
          <div className="grid items-center gap-14 md:grid-cols-2">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full bg-sunu-teal/15 px-3 py-1 text-xs font-bold uppercase tracking-widest text-sunu-teal">
                Pour les professionnels
              </span>
              <h2 className="mt-5 text-3xl font-bold leading-tight md:text-5xl">
                Développez votre cabinet, sereinement.
              </h2>
              <p className="mt-5 text-lg text-white/70">
                Agenda intelligent, dossier patient centralisé, téléconsultation, statistiques.
                Pensé pour médecins, cliniques et pharmacies au Sénégal.
              </p>
              <ul className="mt-8 space-y-3 text-sm">
                {[
                  "Rappels SMS et WhatsApp automatiques : moins de rendez-vous manqués",
                  "Ordonnances électroniques & certificats PDF",
                  "Facturation Wave / Orange Money intégrée",
                ].map((t) => (
                  <li key={t} className="flex items-center gap-2 text-white/85">
                    <CheckCircle2 className="size-4 text-sunu-teal" />
                    {t}
                  </li>
                ))}
              </ul>
              <div className="mt-10 flex flex-wrap gap-3">
                <Link
                  to="/pro"
                  className="rounded-xl bg-sunu-gold px-6 py-3 text-sm font-bold text-sunu-night hover:bg-sunu-gold/90"
                >
                  Inscrire mon cabinet
                </Link>
                <Link
                  to="/tarifs"
                  className="rounded-xl border border-white/20 px-6 py-3 text-sm font-bold text-white hover:bg-white/5"
                >
                  Voir les tarifs
                </Link>
              </div>

              <div className="mt-10 grid grid-cols-3 gap-4 border-t border-white/10 pt-8">
                <Stat label="Médecins vérifiés" value={stats ? String(stats.doctors) : "…"} />
                <Stat label="Villes" value={stats ? String(stats.cities) : "…"} />
                {stats?.rating != null ? (
                  <Stat
                    label={`Note moyenne (${stats.reviews} avis)`}
                    value={`${stats.rating.toLocaleString("fr-FR")}/5`}
                  />
                ) : (
                  <Stat label="Avis vérifiés" value={stats ? String(stats.reviews) : "…"} />
                )}
              </div>
            </div>

            <div className="relative">
              <ProPreview />
            </div>
          </div>
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="reveal mx-auto max-w-4xl px-6 pb-24 text-center">
        <h2 className="text-3xl font-bold tracking-tight text-sunu-dark md:text-4xl">
          Prêt à prendre soin de vous ?
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-sunu-ink/60">
          Prenez rendez-vous, recevez vos ordonnances et suivez votre santé, au même endroit.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            to="/auth"
            className="rounded-xl bg-sunu-green px-8 py-3.5 text-sm font-bold text-white hover:bg-sunu-green/90"
          >
            Créer mon compte patient
          </Link>
          <Link
            to="/pro"
            className="rounded-xl border border-sunu-line bg-sunu-card px-8 py-3.5 text-sm font-bold text-sunu-dark hover:bg-sunu-surface"
          >
            Je suis un professionnel
          </Link>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-sunu-line bg-sunu-card">
        <div className="mx-auto max-w-7xl px-6 py-14">
          <div className="grid gap-10 md:grid-cols-4">
            <div>
              <div className="flex items-center gap-2">
                <FajmaMark className="size-8" />
                <span className="text-lg font-bold text-sunu-green">Fajma</span>
              </div>
              <p className="mt-4 max-w-xs text-sm text-sunu-ink/55">
                La plateforme de santé numérique pensée pour le Sénégal : rendez-vous, ordonnances
                et dossier médical au même endroit.
              </p>
            </div>
            <FooterCol
              title="Patients"
              items={[
                { label: "Trouver un médecin", to: "/medecins" },
                { label: "Téléconsultation", to: "/medecins", search: { tele: "1" } },
                { label: "Assistant symptômes", to: "/assistant" },
                { label: "Pharmacies", to: "/pharmacies" },
                { label: "Aider un proche au Sénégal", to: "/famille" },
                { label: "Nos partenaires", to: "/partenaires" },
                { label: "Aide et contact", to: "/aide" },
              ]}
            />
            <FooterCol
              title="Professionnels"
              items={[
                { label: "Espace médecin", to: "/pro" },
                { label: "Espace clinique", to: "/clinique" },
                { label: "Pharmacies partenaires", to: "/pharmacies" },
                { label: "Tarifs", to: "/tarifs" },
                { label: "Créer un compte", to: "/auth" },
              ]}
            />
            <FooterCol
              title="À propos"
              items={[
                { label: "Mentions légales", to: "/legal" },
                { label: "Confidentialité", to: "/confidentialite" },
                { label: "Conditions d'utilisation", to: "/cgu" },
                { label: "Connexion", to: "/auth" },
              ]}
            />
          </div>
          <div className="mt-12 flex flex-col items-start justify-between gap-4 border-t border-sunu-line pt-6 text-xs text-sunu-ink/50 md:flex-row md:items-center">
            <p>© 2026 Fajma · Dakar, Sénégal</p>
            <div className="flex gap-6">
              <Link to="/legal" className="hover:text-sunu-green">
                Mentions légales
              </Link>
              <Link to="/confidentialite" className="hover:text-sunu-green">
                Confidentialité
              </Link>
              <Link to="/cgu" className="hover:text-sunu-green">
                CGU
              </Link>
              <Link to="/aide" className="hover:text-sunu-green">
                Aide et contact
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({
  image,
  alt,
  tag,
  title,
  body,
  icon: Icon,
}: {
  image: string;
  alt: string;
  tag: string;
  title: string;
  body: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="group">
      <div className="relative overflow-hidden rounded-2xl border border-sunu-line bg-sunu-card">
        <img
          src={image}
          alt={alt}
          width={1200}
          height={900}
          loading="lazy"
          className="aspect-[4/3] w-full object-cover transition duration-500 group-hover:scale-[1.03]"
        />
        <span className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-sunu-card/95 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-sunu-green backdrop-blur">
          <Icon className="size-3.5" />
          {tag}
        </span>
      </div>
      <h3 className="mt-6 text-xl font-bold text-sunu-dark">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-sunu-ink/60">{body}</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-2xl font-bold text-white">{value}</p>
      <p className="mt-1 text-xs uppercase tracking-widest text-white/50">{label}</p>
    </div>
  );
}

type FooterItem = { label: string; to: string; search?: Record<string, string> };

function FooterCol({ title, items }: { title: string; items: FooterItem[] }) {
  return (
    <div>
      <h4 className="text-xs font-bold uppercase tracking-widest text-sunu-ink/40">{title}</h4>
      <ul className="mt-4 space-y-2.5 text-sm text-sunu-ink/70">
        {items.map((i) => (
          <li key={i.label}>
            <Link to={i.to} search={i.search} className="hover:text-sunu-green">
              {i.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Vrais médecins vérifiés, triés par prochaine disponibilité (aucune donnée inventée). */
function AvailableDoctors() {
  const { data, isLoading } = useQuery({
    queryKey: ["home-available-doctors"],
    queryFn: () => listDoctors({ data: { available: "week", sort: "availability" } }),
    staleTime: 60_000,
  });
  const doctors = (data ?? []).slice(0, 3);
  if (isLoading)
    return (
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-44 animate-pulse rounded-3xl bg-sunu-card" />
        ))}
      </div>
    );
  if (!doctors.length)
    return (
      <p className="rounded-3xl border border-dashed border-sunu-line bg-sunu-card p-8 text-center text-sunu-ink/60">
        Consultez l'annuaire pour trouver un médecin et ses prochaines disponibilités.
      </p>
    );
  return (
    <div className="stagger grid grid-cols-1 gap-6 md:grid-cols-3">
      {doctors.map((d) => (
        <HomeDoctorCard key={d.id} d={d} />
      ))}
    </div>
  );
}

function slotText(iso: string) {
  const day = startOfDakarDay(iso).getTime();
  const today = startOfDakarDay(new Date()).getTime();
  const label =
    day === today
      ? "Aujourd'hui"
      : day - today === 86_400_000
        ? "Demain"
        : formatDate(iso, { weekday: "long", day: "numeric", month: "short" });
  return `${label} · ${formatTime(iso)}`;
}

function HomeDoctorCard({ d }: { d: DoctorListItem }) {
  const initials = d.full_name
    .replace(/^Dr\.?\s*/i, "")
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const today =
    d.next_slot &&
    startOfDakarDay(d.next_slot.iso).getTime() === startOfDakarDay(new Date()).getTime();
  return (
    <article className="flex min-w-0 flex-col rounded-3xl border border-sunu-line bg-sunu-card p-5 transition hover:-translate-y-0.5 hover:shadow-sunu-card">
      <div className="flex items-start gap-4">
        {d.avatar_url ? (
          <img
            src={d.avatar_url}
            alt=""
            className="size-16 shrink-0 rounded-2xl object-cover"
            loading="lazy"
          />
        ) : (
          <span className="grid size-16 shrink-0 place-items-center rounded-2xl bg-sunu-green-soft text-xl font-bold text-sunu-green">
            {initials}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-bold text-sunu-dark">{d.full_name}</h3>
          <p className="text-sm text-sunu-ink/60">{d.specialty?.name}</p>
          <p className="mt-0.5 text-xs text-sunu-ink/50">{d.city}</p>
        </div>
        {d.reviews_count > 0 ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-sunu-green-soft px-2 py-1 text-xs font-semibold text-sunu-green">
            <Star className="size-3 fill-current" />
            {d.rating.toLocaleString("fr-FR")}
          </span>
        ) : null}
      </div>
      <div className="mt-5 flex items-center justify-between gap-3 border-t border-sunu-line pt-4">
        <div className="text-xs">
          <p className="flex items-center gap-1.5 text-sunu-ink/50">
            {today && <span className="size-1.5 animate-pulse rounded-full bg-sunu-success" />}
            Prochain rendez-vous
          </p>
          <p className="font-semibold capitalize text-sunu-dark">
            {d.next_slot ? slotText(d.next_slot.iso) : "Sur demande"}
          </p>
        </div>
        <Link
          to="/medecins/$id"
          params={{ id: d.id }}
          className="rounded-xl bg-sunu-green px-4 py-2 text-xs font-bold text-white transition hover:bg-sunu-green/90"
        >
          Réserver
        </Link>
      </div>
    </article>
  );
}

/** Maquette de l'agenda du médecin (illustration, dessinée aux couleurs de Fajma). */
function ProPreview() {
  const rows = [
    ["08:30", "Consultation", "Confirmé", "bg-sunu-teal/20 text-sunu-teal"],
    ["09:00", "Suivi hypertension", "Arrivé", "bg-sunu-green/25 text-sunu-green"],
    ["09:30", "Vidéo · Résultats d'analyses", "Confirmé", "bg-sunu-teal/20 text-sunu-teal"],
    ["10:00", "Première consultation", "À confirmer", "bg-sunu-gold/25 text-sunu-gold"],
  ] as const;
  return (
    <div
      role="img"
      aria-label="Illustration : agenda du jour d'un médecin sur Fajma"
      className="rounded-2xl border border-white/10 bg-sunu-night p-5 shadow-2xl"
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-white/45">
            Aujourd'hui
          </p>
          <p className="text-lg font-bold text-white">12 rendez-vous</p>
        </div>
        <div className="flex gap-2 text-center">
          {[
            ["3", "à confirmer"],
            ["9", "rappels SMS"],
          ].map(([v, l]) => (
            <div key={l} className="rounded-xl bg-white/5 px-3 py-1.5">
              <p className="text-sm font-bold text-white">{v}</p>
              <p className="text-[10px] text-white/45">{l}</p>
            </div>
          ))}
        </div>
      </div>
      <ul className="mt-4 space-y-2">
        {rows.map(([time, motif, status, cls]) => (
          <li
            key={time}
            className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2.5"
          >
            <span className="w-11 text-sm font-bold text-white">{time}</span>
            <span className="h-2 w-24 rounded-full bg-white/15" aria-hidden />
            <span className="min-w-0 flex-1 truncate text-xs text-white/55">{motif}</span>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${cls}`}>
              {status}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-4 grid grid-cols-3 gap-2 text-[11px] text-white/60">
        {["Ordonnance signée", "SMS de rappel", "Paiement Wave"].map((t) => (
          <span
            key={t}
            className="flex items-center justify-center gap-1 rounded-lg bg-sunu-green/15 px-2 py-2 text-center font-semibold text-sunu-green"
          >
            <CheckCircle2 className="size-3.5 shrink-0" /> {t}
          </span>
        ))}
      </div>
    </div>
  );
}
