/**
 * Rapport d'activité (cession, investisseurs, partenaires) : chiffres réels agrégés par mois, sans aucune
 * donnée nominative. Téléchargeable en tableur, imprimable en PDF.
 */
import { useQuery } from "@tanstack/react-query";
import { FileSpreadsheet, Printer, TrendingDown, TrendingUp } from "lucide-react";
import { useState } from "react";
import { activityReportCsvUrl, getActivityReport, type ActivityMonth } from "@/api/admin";
import { formatDateTime } from "@/lib/datetime";

const fcfa = (n: number) => `${n.toLocaleString("fr-FR")} F`;
const pct = (n: number | null) => (n == null ? "—" : `${n.toLocaleString("fr-FR")} %`);
const CHANNELS: Record<string, string> = {
  web: "Site et application",
  whatsapp: "WhatsApp",
  ussd: "USSD",
  clinic: "Secrétariat",
};

const COLUMNS: { key: keyof ActivityMonth; label: string; money?: boolean }[] = [
  { key: "new_patients", label: "Nouveaux patients" },
  { key: "active_patients", label: "Patients actifs" },
  { key: "new_doctors", label: "Nouveaux médecins" },
  { key: "appointments_booked", label: "RDV réservés" },
  { key: "appointments_completed", label: "Consultations" },
  { key: "teleconsultations", label: "dont vidéo" },
  { key: "prescriptions", label: "Ordonnances" },
  { key: "pharmacy_orders", label: "Commandes pharmacie" },
  { key: "lab_orders", label: "Analyses" },
  { key: "online_volume", label: "Paiements en ligne", money: true },
  { key: "revenue", label: "CA Fajma", money: true },
];

export function ActivityReport() {
  const [months, setMonths] = useState(12);
  const { data } = useQuery({
    queryKey: ["admin-activity-report", months],
    queryFn: () => getActivityReport(months),
  });

  // Impression du rapport seul, en clair, dans une fenêtre dédiée (enregistrable en PDF).
  const print = () => {
    const el = document.getElementById("rapport-activite");
    const win = window.open("", "_blank", "width=1100,height=800");
    if (!el || !win) return;
    const styles = [...document.querySelectorAll('link[rel="stylesheet"], style')]
      .map((n) => n.outerHTML)
      .join("");
    win.document.write(
      `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Fajma — rapport d'activité</title>${styles}<style>@page{size:A4 landscape;margin:12mm}body{background:#fff}</style></head><body>${el.outerHTML}</body></html>`,
    );
    win.document.close();
    win.addEventListener("load", () => {
      win.focus();
      win.print();
    });
  };

  return (
    <section
      id="rapport-activite"
      aria-label="Rapport d'activité"
      className="rounded-xl border border-sunu-line bg-sunu-card p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-bold text-sunu-dark">Rapport d'activité</h2>
          <p className="mt-1 max-w-2xl text-xs text-sunu-ink/60">
            Chiffres réels de la plateforme, mois par mois, pour un acquéreur, un investisseur ou un
            partenaire. Aucune donnée nominative : uniquement des totaux.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <select
            aria-label="Période"
            value={months}
            onChange={(e) => setMonths(Number(e.target.value))}
            className="rounded-lg border border-sunu-line bg-sunu-card px-2 py-1.5 text-xs"
          >
            <option value={6}>6 derniers mois</option>
            <option value={12}>12 derniers mois</option>
            <option value={24}>24 derniers mois</option>
          </select>
          <a
            href={activityReportCsvUrl(months)}
            className="flex items-center gap-1.5 rounded-lg border border-sunu-line px-3 py-1.5 text-xs font-semibold text-sunu-ink/70 hover:border-sunu-green hover:text-sunu-green"
          >
            <FileSpreadsheet className="size-3.5" /> Tableur
          </a>
          <button
            onClick={print}
            className="flex items-center gap-1.5 rounded-lg bg-sunu-green px-3 py-1.5 text-xs font-semibold text-white"
          >
            <Printer className="size-3.5" /> Imprimer / PDF
          </button>
        </div>
      </div>

      {!data ? (
        <div className="mt-4 h-40 animate-pulse rounded-lg bg-sunu-surface" />
      ) : (
        <>
          <p className="mt-2 hidden text-xs text-gray-600 print:block">
            Fajma — rapport généré le{" "}
            {formatDateTime(data.generated_at, { dateStyle: "long", timeStyle: "short" })}, période
            du {data.months[0]?.label} au {data.months.at(-1)?.label}.
          </p>
          <div className="stagger mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <Kpi label="Patients inscrits" value={data.totals.patients.toLocaleString("fr-FR")} />
            <Kpi
              label="Médecins publiés"
              value={String(data.totals.doctors_verified)}
              hint={`${data.totals.cities} ville(s)`}
            />
            <Kpi
              label="Partenaires"
              value={String(
                data.totals.clinics + data.totals.partner_pharmacies + data.totals.partner_labs,
              )}
              hint={`${data.totals.clinics} clin. · ${data.totals.partner_pharmacies} pharm. · ${data.totals.partner_labs} labo.`}
            />
            <Kpi
              label="Consultations (période)"
              value={data.totals.appointments_completed.toLocaleString("fr-FR")}
              trend={data.totals.growth_appointments}
            />
            <Kpi
              label="CA Fajma (période)"
              value={fcfa(data.totals.revenue)}
              hint={`sur ${fcfa(data.totals.online_volume)} payés en ligne`}
            />
            <Kpi
              label="Patients fidèles"
              value={pct(data.totals.returning_patients_rate)}
              hint={`absences : ${pct(data.totals.no_show_rate)}`}
            />
          </div>

          <div className="mt-5 overflow-x-auto rounded-lg border border-sunu-line">
            <table className="w-full min-w-[860px] text-right text-xs">
              <thead className="bg-sunu-surface text-[11px] uppercase tracking-wide text-sunu-ink/60">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Mois</th>
                  {COLUMNS.map((c) => (
                    <th key={c.key} className="px-3 py-2 font-semibold">
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-sunu-line text-sunu-dark">
                {data.months.map((m) => (
                  <tr key={m.month}>
                    <td className="px-3 py-1.5 text-left font-semibold capitalize">{m.label}</td>
                    {COLUMNS.map((c) => (
                      <td key={c.key} className="px-3 py-1.5 tabular-nums">
                        {c.money
                          ? fcfa(m[c.key] as number)
                          : (m[c.key] as number).toLocaleString("fr-FR")}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="bg-sunu-surface font-bold">
                  <td className="px-3 py-1.5 text-left">Total</td>
                  {COLUMNS.map((c) => {
                    const total = data.months.reduce((s, m) => s + (m[c.key] as number), 0);
                    return (
                      <td key={c.key} className="px-3 py-1.5 tabular-nums">
                        {c.key === "active_patients"
                          ? "—"
                          : c.money
                            ? fcfa(total)
                            : total.toLocaleString("fr-FR")}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>

          <div className="mt-4 grid gap-4 text-xs text-sunu-ink/70 md:grid-cols-2">
            <p>
              <b className="text-sunu-dark">Canaux de réservation (période) :</b>{" "}
              {data.channels.length
                ? data.channels.map((c) => `${CHANNELS[c.channel] ?? c.channel} ${c.n}`).join(" · ")
                : "—"}
            </p>
            <p>
              <b className="text-sunu-dark">Satisfaction :</b>{" "}
              {data.totals.average_rating != null
                ? `${data.totals.average_rating.toLocaleString("fr-FR")}/5 sur ${data.totals.reviews} avis publiés`
                : "pas encore d'avis"}
            </p>
          </div>
          <p className="mt-3 text-[11px] text-sunu-ink/50">
            Définitions : patients actifs = au moins un rendez-vous dans le mois ; CA Fajma =
            commissions sur les paiements en ligne + abonnements des médecins ; patients fidèles =
            part des patients ayant consulté au moins deux fois ; évolution = dernier mois complet
            comparé au précédent.
          </p>
        </>
      )}
    </section>
  );
}

function Kpi({
  label,
  value,
  hint,
  trend,
}: {
  label: string;
  value: string;
  hint?: string;
  trend?: number | null;
}) {
  return (
    <div className="rounded-lg bg-sunu-surface px-3 py-2.5">
      <p className="text-[11px] text-sunu-ink/55">{label}</p>
      <p className="mt-0.5 text-lg font-bold text-sunu-dark">{value}</p>
      {trend != null ? (
        <p
          className={`flex items-center gap-1 text-[11px] font-semibold ${trend >= 0 ? "text-sunu-green" : "text-red-600"}`}
        >
          {trend >= 0 ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
          {trend > 0 ? "+" : ""}
          {trend.toLocaleString("fr-FR")} % sur un mois
        </p>
      ) : (
        hint && <p className="text-[11px] text-sunu-ink/50">{hint}</p>
      )}
    </div>
  );
}
