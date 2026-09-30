/** Administration : pilotage de l'activité (tendances hebdomadaires, canaux, spécialités, villes). */
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BarChart3 } from "lucide-react";
import { getAnalytics } from "@/api/admin";

const CHANNELS: Record<string, string> = {
  web: "Site / appli",
  whatsapp: "WhatsApp",
  ussd: "USSD",
  clinic: "Secrétariat",
};
// Couleurs du thème (s'adaptent au mode sombre).
const GREEN = "var(--sunu-green)";
const TEAL = "var(--sunu-teal)";
const AMBER = "#d97706";
const shortWeek = (iso: string) =>
  new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });

export function AnalyticsDashboard() {
  const [weeks, setWeeks] = useState(12);
  const { data } = useQuery({
    queryKey: ["admin-analytics", weeks],
    queryFn: () => getAnalytics(weeks),
  });
  if (!data) return null;
  const k = data.kpis;
  const cards = [
    ["Patients inscrits", k.patients],
    ["Médecins publiés", k.doctors_verified],
    ["Médecins à vérifier", k.doctors_pending],
    ["Cliniques", k.clinics],
    ["Pharmacies partenaires", k.partner_pharmacies],
    ["Abonnements payants", k.paying_subscriptions],
    ["Taux d'absence", `${k.no_show_rate} %`],
    ["Part téléconsultation", `${k.teleconsultation_share} %`],
  ] as const;
  const series = data.series.map((s) => ({ ...s, label: shortWeek(s.week) }));
  const totalChannel = data.by_channel.reduce((a, c) => a + c.n, 0) || 1;

  return (
    <section aria-label="Pilotage" className="rounded-xl border border-sunu-line bg-sunu-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-bold text-sunu-dark">
          <BarChart3 className="size-4" /> Pilotage de l'activité
        </h2>
        <select
          aria-label="Période"
          value={weeks}
          onChange={(e) => setWeeks(Number(e.target.value))}
          className="rounded-lg border border-sunu-line px-2 py-1 text-xs"
        >
          {[4, 12, 26, 52].map((w) => (
            <option key={w} value={w}>
              {w} dernières semaines
            </option>
          ))}
        </select>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {cards.map(([label, value]) => (
          <div key={label} className="rounded-lg bg-sunu-surface px-3 py-2">
            <p className="text-lg font-bold text-sunu-dark">{value}</p>
            <p className="text-[11px] text-sunu-ink/55">{label}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <figure>
          <figcaption className="text-xs font-semibold text-sunu-ink/60">
            Rendez-vous par semaine
          </figcaption>
          <div className="mt-2 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--sunu-line)" />
                <XAxis dataKey="label" fontSize={11} />
                <YAxis allowDecimals={false} fontSize={11} width={32} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line
                  type="monotone"
                  dataKey="booked"
                  name="Réservés"
                  stroke={GREEN}
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="completed"
                  name="Honorés"
                  stroke={TEAL}
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="no_show"
                  name="Absences"
                  stroke={AMBER}
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </figure>
        <figure>
          <figcaption className="text-xs font-semibold text-sunu-ink/60">
            Paiements en ligne et commission (FCFA)
          </figcaption>
          <div className="mt-2 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={series}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--sunu-line)" />
                <XAxis dataKey="label" fontSize={11} />
                <YAxis fontSize={11} width={52} />
                <Tooltip formatter={(v: number) => `${v.toLocaleString("fr-FR")} F`} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="online_volume" name="Volume" fill={GREEN} />
                <Bar dataKey="commission" name="Commission" fill={TEAL} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </figure>
      </div>

      <div className="mt-5 grid gap-5 text-sm sm:grid-cols-3">
        <Breakdown
          title="Canal de réservation (90 j)"
          rows={data.by_channel.map((c) => ({ name: CHANNELS[c.channel] ?? c.channel, n: c.n }))}
          total={totalChannel}
        />
        <Breakdown title="Spécialités (90 j)" rows={data.by_specialty} total={totalChannel} />
        <Breakdown title="Villes (90 j)" rows={data.by_city} total={totalChannel} />
      </div>
    </section>
  );
}

function Breakdown({
  title,
  rows,
  total,
}: {
  title: string;
  rows: { name: string; n: number }[];
  total: number;
}) {
  return (
    <div>
      <p className="text-xs font-semibold text-sunu-ink/60">{title}</p>
      {rows.length === 0 && <p className="mt-2 text-xs text-sunu-ink/40">Pas encore de données.</p>}
      <ul className="mt-2 space-y-1.5">
        {rows.map((r) => (
          <li key={r.name}>
            <div className="flex justify-between text-xs">
              <span>{r.name}</span>
              <span className="font-semibold">{r.n}</span>
            </div>
            <div className="mt-0.5 h-1.5 rounded-full bg-sunu-surface">
              <div
                className="h-1.5 rounded-full bg-sunu-green"
                style={{ width: `${Math.round((100 * r.n) / total)}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
