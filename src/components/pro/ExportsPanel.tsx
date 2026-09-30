/** Exports tableur (Excel) : rendez-vous, bordereau de tiers payant, revenus. */
import { useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import { proExportUrl } from "@/api/doctor";

const iso = (d: Date) => d.toISOString().slice(0, 10);

export function ExportsPanel() {
  const now = new Date();
  const [from, setFrom] = useState(
    iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))),
  );
  const [to, setTo] = useState(iso(now));
  const link =
    "flex items-center justify-between rounded-lg border border-sunu-line px-3 py-2 text-xs font-semibold text-sunu-ink/80 hover:border-sunu-green hover:text-sunu-green";
  return (
    <section aria-label="Exports" className="rounded-2xl border border-sunu-line bg-sunu-card p-5">
      <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-sunu-ink/50">
        <FileSpreadsheet className="size-4" /> Exports (Excel)
      </h2>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="grid gap-1 text-xs text-sunu-ink/60">
          Du
          <input
            type="date"
            value={from}
            max={to}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-lg border border-sunu-line bg-sunu-card px-2 py-1.5 text-sm"
          />
        </label>
        <label className="grid gap-1 text-xs text-sunu-ink/60">
          Au
          <input
            type="date"
            value={to}
            min={from}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-lg border border-sunu-line bg-sunu-card px-2 py-1.5 text-sm"
          />
        </label>
      </div>
      <div className="mt-3 grid gap-2">
        <a href={proExportUrl("appointments", from, to)} className={link}>
          Rendez-vous{" "}
          <span className="font-normal text-sunu-ink/50">patients, statuts, montants</span>
        </a>
        <a href={proExportUrl("insurance", from, to)} className={link}>
          Bordereau tiers payant{" "}
          <span className="font-normal text-sunu-ink/50">à envoyer aux IPM, assurances</span>
        </a>
        <a href={proExportUrl("finance", from, to)} className={link}>
          Revenus{" "}
          <span className="font-normal text-sunu-ink/50">
            encaissements, commissions, virements
          </span>
        </a>
      </div>
      <p className="mt-2 text-[11px] text-sunu-ink/50">
        Fichiers personnels : chaque export est inscrit au journal des accès. Ne les partagez pas.
      </p>
    </section>
  );
}
