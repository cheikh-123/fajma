/**
 * Page des secours (QR code scanné) : alertes vitales en tête, numéros d'urgence, personnes à prévenir
 * (appel, WhatsApp, envoi de la position), groupe sanguin, allergies, traitements, appareils, médecin
 * traitant, assurance. En français, wolof ou anglais d'un geste. Toujours en clair, lisible au soleil.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  BadgeInfo,
  Cpu,
  Droplet,
  Loader2,
  MapPin,
  MessageCircle,
  Phone,
  Pill,
  ShieldPlus,
  Siren,
  Stethoscope,
  User,
  Weight,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { getEmergencyCard, type EmergencyContact } from "@/api/followup";
import { FLAG_LABELS, UI, type EmergencyLang } from "@/lib/emergency-labels";

export const Route = createFileRoute("/urgence/$token")({
  head: () => ({
    meta: [
      { title: "Fiche d'urgence — Fajma" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: EmergencyPage,
});

const LOCALE: Record<EmergencyLang, string> = { fr: "fr-FR", wo: "fr-SN", en: "en-GB" };

function EmergencyPage() {
  const { token } = Route.useParams();
  const [lang, setLang] = useState<EmergencyLang>("fr");
  const t = UI[lang];
  const { data, isLoading, isError } = useQuery({
    queryKey: ["emergency-public", token],
    queryFn: () => getEmergencyCard(token),
    retry: false,
  });
  const flags = data?.critical_flags ?? [];

  return (
    <div className="min-h-screen bg-white text-[#111827] [color-scheme:light]">
      <header className="bg-[#dc2626] px-5 pb-5 pt-4 text-white">
        <div className="mx-auto flex max-w-lg items-center justify-between">
          <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest">
            <Siren className="size-5" /> {t.title}
          </p>
          <div
            className="flex rounded-full bg-white/20 p-0.5 text-xs font-bold"
            role="group"
            aria-label="Langue"
          >
            {(["fr", "wo", "en"] as const).map((l) => (
              <button
                key={l}
                onClick={() => setLang(l)}
                aria-pressed={lang === l}
                className={`rounded-full px-2.5 py-1 ${lang === l ? "bg-white text-[#b91c1c]" : ""}`}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        <div className="mx-auto mt-4 grid max-w-lg gap-2">
          <a
            href="tel:1515"
            className="flex items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-lg font-bold text-[#b91c1c]"
          >
            <Phone className="size-5" /> {t.samu}
          </a>
          <div className="grid grid-cols-2 gap-2">
            <a
              href="tel:18"
              className="rounded-xl bg-white/15 px-3 py-2 text-center text-sm font-semibold"
            >
              {t.pompiers}
            </a>
            <a
              href="tel:17"
              className="rounded-xl bg-white/15 px-3 py-2 text-center text-sm font-semibold"
            >
              {t.police}
            </a>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-lg px-5 py-6">
        {isLoading && <Loader2 className="mx-auto size-8 animate-spin text-[#9ca3af]" />}
        {isError && (
          <p className="rounded-2xl bg-[#f3f4f6] p-5 text-center text-sm text-[#374151]">
            {t.missing}
          </p>
        )}
        {data && (
          <>
            <div className="flex items-center gap-3">
              <span className="grid size-12 place-items-center rounded-full bg-[#f3f4f6]">
                <User className="size-6 text-[#4b5563]" />
              </span>
              <div>
                <h1 className="text-2xl font-bold">{data.full_name}</h1>
                <p className="text-sm text-[#4b5563]">
                  {data.age != null ? `${data.age} ${t.years}` : ""}
                  {data.sex ? ` · ${data.sex === "F" ? t.woman : t.man}` : ""}
                  {data.weight ? ` · ${data.weight} kg` : ""}
                </p>
              </div>
            </div>

            {flags.length > 0 && (
              <div className="mt-5 rounded-2xl border-2 border-[#dc2626] bg-[#fef2f2] p-4">
                <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#b91c1c]">
                  <AlertTriangle className="size-4" /> {t.alerts}
                </p>
                <ul className="mt-2 space-y-1">
                  {flags.map((f) => (
                    <li
                      key={f}
                      className="text-lg font-extrabold uppercase leading-tight text-[#991b1b]"
                    >
                      {FLAG_LABELS[f]?.[lang] ?? f}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {data.contacts && data.contacts.length > 0 && (
              <Contacts contacts={data.contacts} lang={lang} name={data.full_name} />
            )}

            <div className="mt-4 grid gap-3">
              {data.blood_group !== undefined && (
                <Item icon={<Droplet className="size-5 text-[#dc2626]" />} label={t.blood}>
                  <span className="text-3xl font-bold text-[#b91c1c]">
                    {data.blood_group || t.notProvided}
                  </span>
                </Item>
              )}
              {data.allergies !== undefined && (
                <Item
                  icon={<AlertTriangle className="size-5 text-[#d97706]" />}
                  label={t.allergies}
                  alert={Boolean(data.allergies)}
                >
                  {data.allergies || t.noAllergy}
                </Item>
              )}
              {data.treatments !== undefined && (
                <Item icon={<Pill className="size-5 text-[#1d4ed8]" />} label={t.treatments}>
                  {data.treatments || t.notProvided}
                </Item>
              )}
              {data.conditions !== undefined && (
                <Item icon={<Stethoscope className="size-5 text-[#047857]" />} label={t.conditions}>
                  {data.conditions || t.notProvided}
                </Item>
              )}
              {data.medical_devices && (
                <Item icon={<Cpu className="size-5 text-[#7c3aed]" />} label={t.devices} alert>
                  {data.medical_devices}
                </Item>
              )}
              {data.rescuer_notes && (
                <Item icon={<BadgeInfo className="size-5 text-[#0369a1]" />} label={t.notes} alert>
                  {data.rescuer_notes}
                </Item>
              )}
              {data.doctor && (
                <Item icon={<Stethoscope className="size-5 text-[#047857]" />} label={t.doctor}>
                  <span className="block">
                    {data.doctor.name}
                    {data.doctor.specialty ? ` · ${data.doctor.specialty}` : ""} ·{" "}
                    {data.doctor.city}
                  </span>
                  {data.doctor.phone && (
                    <a
                      href={`tel:${data.doctor.phone}`}
                      className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-[#111827] px-3 py-2 text-sm font-semibold text-white"
                    >
                      <Phone className="size-4" /> {t.call}
                    </a>
                  )}
                </Item>
              )}
              {data.insurance && (
                <Item icon={<ShieldPlus className="size-5 text-[#0f766e]" />} label={t.insurance}>
                  {data.insurance.insurer} · {t.member} {data.insurance.member_number}
                </Item>
              )}
              {data.weight && !data.age && (
                <Item icon={<Weight className="size-5 text-[#4b5563]" />} label={t.weight}>
                  {data.weight} kg
                </Item>
              )}
            </div>
            <p className="mt-6 text-xs text-[#6b7280]">
              {t.footer.replace(
                "{date}",
                new Date(data.updated_at).toLocaleDateString(LOCALE[lang], {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                }),
              )}
            </p>
          </>
        )}
      </main>
    </div>
  );
}

function Contacts({
  contacts,
  lang,
  name,
}: {
  contacts: EmergencyContact[];
  lang: EmergencyLang;
  name: string;
}) {
  const t = UI[lang];
  // Position des secours envoyée au proche par SMS (lien de carte), si le téléphone l'autorise.
  const sendPosition = (phone: string) => {
    const go = (where: string) =>
      window.location.assign(
        `sms:${phone}?body=${encodeURIComponent(`Urgence pour ${name} : ${where}`)}`,
      );
    if (!navigator.geolocation) return go("position inconnue");
    navigator.geolocation.getCurrentPosition(
      (p) =>
        go(
          `https://maps.google.com/?q=${p.coords.latitude.toFixed(5)},${p.coords.longitude.toFixed(5)}`,
        ),
      () => go("position inconnue"),
      { timeout: 8000 },
    );
  };
  return (
    <div className="mt-4 rounded-2xl border border-[#e5e7eb] p-4">
      <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#4b5563]">
        <Phone className="size-4" /> {t.contacts}
      </p>
      <ul className="mt-2 space-y-3">
        {contacts.map((c, i) => (
          <li key={i}>
            <p className="text-base font-semibold">
              {c.name}
              {c.relation && <span className="font-normal text-[#4b5563]"> · {c.relation}</span>}
            </p>
            {c.phone && (
              <div className="mt-1.5 flex flex-wrap gap-2">
                <a
                  href={`tel:${c.phone}`}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#16a34a] px-3 py-2 text-sm font-bold text-white"
                >
                  <Phone className="size-4" /> {t.call}
                </a>
                <a
                  href={`https://wa.me/${c.phone.replace(/\D/g, "")}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#d1d5db] px-3 py-2 text-sm font-semibold"
                >
                  <MessageCircle className="size-4" /> WhatsApp
                </a>
                <button
                  onClick={() => sendPosition(c.phone!)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#d1d5db] px-3 py-2 text-sm font-semibold"
                >
                  <MapPin className="size-4" /> {t.position}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Item({
  icon,
  label,
  alert = false,
  children,
}: {
  icon: ReactNode;
  label: string;
  alert?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 ${alert ? "border-[#fbbf24] bg-[#fffbeb]" : "border-[#e5e7eb]"}`}
    >
      <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#4b5563]">
        {icon} {label}
      </p>
      <div className="mt-2 whitespace-pre-line text-base font-semibold">{children}</div>
    </div>
  );
}
