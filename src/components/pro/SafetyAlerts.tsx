/**
 * Alertes de sécurité d'une ordonnance, pendant que le médecin la rédige : allergies, interactions avec les
 * traitements en cours, contre-indications liées à l'état du patient, limites d'âge.
 * Une alerte majeure doit être justifiée par écrit pour que l'ordonnance puisse être enregistrée.
 */
import { AlertOctagon, AlertTriangle, Info, ShieldCheck } from "lucide-react";
import type { SafetyAlert, SafetyLevel, SafetyResult } from "@/api/safety";

const STYLE: Record<SafetyLevel, { box: string; icon: typeof Info; text: string }> = {
  majeure: {
    box: "border-red-300 bg-red-50 text-red-800 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200",
    icon: AlertOctagon,
    text: "text-red-700 dark:text-red-300",
  },
  moderee: {
    box: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100",
    icon: AlertTriangle,
    text: "text-amber-800 dark:text-amber-200",
  },
  information: {
    box: "border-sunu-line bg-sunu-surface text-sunu-ink/80",
    icon: Info,
    text: "text-sunu-ink/60",
  },
};

export function SafetyAlerts({
  result,
  checking,
  override,
  onOverride,
}: {
  result: SafetyResult | null;
  checking: boolean;
  override: string;
  onOverride: (v: string) => void;
}) {
  if (!result) {
    return checking ? (
      <p className="mt-2 text-xs text-sunu-ink/50">Vérification de l'ordonnance…</p>
    ) : null;
  }
  if (result.alerts.length === 0) {
    return (
      <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-sunu-teal">
        <ShieldCheck className="size-3.5" />
        Aucune alerte : ni allergie, ni interaction, ni contre-indication connue.
      </p>
    );
  }
  return (
    <div className="mt-2 space-y-2">
      {result.alerts.map((a, i) => (
        <AlertRow key={`${a.title}-${a.medicine}-${i}`} alert={a} />
      ))}
      {result.blocking && (
        <label className="block rounded-lg border border-red-300 bg-red-50 p-3 text-xs dark:border-red-500/40 dark:bg-red-500/10">
          <span className="font-bold text-red-800 dark:text-red-200">
            Pour maintenir cette ordonnance, indiquez pourquoi
          </span>
          <span className="mt-0.5 block text-red-700/80 dark:text-red-300/80">
            Votre justification est conservée avec l'ordonnance et inscrite au journal.
          </span>
          <textarea
            value={override}
            onChange={(e) => onOverride(e.target.value)}
            maxLength={500}
            placeholder="Ex. allergie ancienne et douteuse, bénéfice supérieur au risque, surveillance organisée…"
            className="mt-2 min-h-16 w-full rounded-lg border border-red-300 bg-sunu-card px-2.5 py-1.5 text-sm text-sunu-ink outline-none"
          />
        </label>
      )}
      {!result.patient_known && (
        <p className="text-xs text-sunu-ink/50">
          Le patient n'a renseigné ni allergie ni traitement : le contrôle reste partiel.
        </p>
      )}
    </div>
  );
}

function AlertRow({ alert }: { alert: SafetyAlert }) {
  const s = STYLE[alert.level];
  return (
    <div className={`flex gap-2 rounded-lg border px-3 py-2 text-xs ${s.box}`}>
      <s.icon className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">
        <p className="font-bold">
          {alert.medicine ? `${alert.medicine} — ` : ""}
          {alert.title}
        </p>
        <p className="mt-0.5">{alert.detail}</p>
        <p className={`mt-0.5 text-[11px] uppercase tracking-wider ${s.text}`}>
          {alert.level_label}
        </p>
      </div>
    </div>
  );
}
