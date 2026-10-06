/**
 * Veille épidémiologique anonymisée : consultations par grand syndrome, ville et semaine ; signaux de hausse
 * inhabituelle. Cases de moins de 5 masquées. À partager avec les autorités sanitaires après accord de la CDP.
 */
import { useQuery } from "@tanstack/react-query";
import { Activity, AlertTriangle, Download } from "lucide-react";
import { api } from "@/api/client";

type Epidemio = {
  weeks: string[];
  rows: { syndrome: string; city: string; counts: (number | string)[]; total: number | string }[];
  signals: { syndrome: string; city: string; current: number; usual: number }[];
  min_cell: number;
};

export function EpidemioAdmin() {
  const { data } = useQuery({
    queryKey: ["admin-epidemio"],
    queryFn: () => api.get<Epidemio>("/admin/epidemio", { weeks: 12 }),
  });
  if (!data) return null;
  const shortWeek = (w: string) =>
    new Date(`${w}T00:00:00`).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
  return (
    <section className="rounded-xl border border-sunu-line bg-sunu-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-bold text-sunu-dark">
          <Activity className="size-5 text-sunu-green" /> Veille épidémiologique (12 semaines)
        </h2>
        <a
          href="/api/admin/epidemio?weeks=12&export=csv"
          className="flex items-center gap-1.5 rounded-lg border border-sunu-line px-3 py-1.5 text-xs font-semibold"
        >
          <Download className="size-3.5" /> Tableur (anonymisé)
        </a>
      </div>
      <p className="mt-1 text-xs text-sunu-ink/55">
        Comptes de consultations par grand syndrome (motif et diagnostic), sans aucune donnée
        personnelle ; cases de moins de {data.min_cell} masquées. Un signal est une hausse
        inhabituelle à vérifier, jamais un diagnostic.
      </p>
      {data.signals.length > 0 ? (
        <ul className="mt-3 space-y-1.5">
          {data.signals.map((s) => (
            <li
              key={`${s.syndrome}-${s.city}`}
              className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800"
            >
              <AlertTriangle className="size-4" /> <b>{s.syndrome}</b> à {s.city} : {s.current} cas
              cette semaine (habituellement {s.usual})
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-sunu-teal">Aucune hausse inhabituelle cette semaine.</p>
      )}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-left text-sunu-ink/55">
            <tr>
              <th className="py-1.5 pr-3">Syndrome</th>
              <th className="py-1.5 pr-3">Ville</th>
              {data.weeks.map((w) => (
                <th key={w} className="px-1 py-1.5 text-right font-normal">
                  {shortWeek(w)}
                </th>
              ))}
              <th className="py-1.5 pl-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-sunu-line">
            {data.rows.length === 0 && (
              <tr>
                <td colSpan={data.weeks.length + 3} className="py-4 text-center text-sunu-ink/50">
                  Pas encore de données.
                </td>
              </tr>
            )}
            {data.rows.map((r) => (
              <tr key={`${r.syndrome}-${r.city}`}>
                <td className="py-1.5 pr-3 font-semibold text-sunu-dark">{r.syndrome}</td>
                <td className="py-1.5 pr-3">{r.city}</td>
                {r.counts.map((c, i) => (
                  <td key={i} className="px-1 py-1.5 text-right tabular-nums">
                    {c}
                  </td>
                ))}
                <td className="py-1.5 pl-2 text-right font-bold tabular-nums">{r.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
