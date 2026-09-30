import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Droplet,
  Loader2,
  Phone,
  Pill,
  Siren,
  Stethoscope,
  User,
} from "lucide-react";
import type { ReactNode } from "react";
import { getEmergencyCard } from "@/api/followup";
import { formatDate } from "@/lib/datetime";

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

/** Numéro de téléphone contenu dans le texte « personne à prévenir », pour l'appeler en un geste. */
function phoneIn(text: string) {
  const m = text.match(/(\+?\d[\d\s.-]{7,}\d)/);
  return m ? m[1]!.replace(/[\s.-]/g, "") : null;
}

function EmergencyPage() {
  const { token } = Route.useParams();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["emergency-public", token],
    queryFn: () => getEmergencyCard(token),
    retry: false,
  });

  return (
    <div className="min-h-screen bg-white text-[#111827] [color-scheme:light]">
      <header className="bg-[#dc2626] px-5 py-6 text-white">
        <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest">
          <Siren className="size-5" /> Fiche d'urgence
        </p>
        <a
          href="tel:1515"
          className="mt-4 flex items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-lg font-bold text-[#b91c1c]"
        >
          <Phone className="size-5" /> Appeler le SAMU : 1515
        </a>
      </header>
      <main className="mx-auto max-w-lg px-5 py-6">
        {isLoading && <Loader2 className="mx-auto size-8 animate-spin text-[#9ca3af]" />}
        {isError && (
          <p className="rounded-2xl bg-[#f3f4f6] p-5 text-center text-sm text-[#374151]">
            Cette fiche d'urgence n'existe pas ou a été désactivée par son titulaire.
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
                  {data.age != null ? `${data.age} ans` : ""}
                  {data.sex ? ` · ${data.sex === "F" ? "femme" : "homme"}` : ""}
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-3">
              {"blood_group" in data && (
                <Item icon={<Droplet className="size-5 text-[#dc2626]" />} label="Groupe sanguin">
                  <span className="text-3xl font-bold text-[#b91c1c]">
                    {data.blood_group || "Non renseigné"}
                  </span>
                </Item>
              )}
              {"allergies" in data && (
                <Item
                  icon={<AlertTriangle className="size-5 text-[#d97706]" />}
                  label="Allergies"
                  alert={Boolean(data.allergies)}
                >
                  {data.allergies || "Aucune allergie connue indiquée"}
                </Item>
              )}
              {"treatments" in data && (
                <Item
                  icon={<Pill className="size-5 text-[#1d4ed8]" />}
                  label="Traitements en cours"
                >
                  {data.treatments || "Non renseigné"}
                </Item>
              )}
              {"conditions" in data && (
                <Item
                  icon={<Stethoscope className="size-5 text-[#047857]" />}
                  label="Antécédents et maladies"
                >
                  {data.conditions || "Non renseigné"}
                </Item>
              )}
              {"emergency_contact" in data && data.emergency_contact && (
                <Item
                  icon={<Phone className="size-5 text-[#374151]" />}
                  label="Personne à prévenir"
                >
                  <span className="block">{data.emergency_contact}</span>
                  {phoneIn(data.emergency_contact) && (
                    <a
                      href={`tel:${phoneIn(data.emergency_contact)}`}
                      className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-[#111827] px-3 py-2 text-sm font-semibold text-white"
                    >
                      <Phone className="size-4" /> Appeler
                    </a>
                  )}
                </Item>
              )}
            </div>
            <p className="mt-6 text-xs text-[#6b7280]">
              Informations déclarées par la personne elle-même, mises à jour le{" "}
              {formatDate(data.updated_at, { day: "numeric", month: "long", year: "numeric" })}.
              Elles ne remplacent pas l'examen médical. Fiche fournie par Fajma ; chaque
              consultation est enregistrée.
            </p>
          </>
        )}
      </main>
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
