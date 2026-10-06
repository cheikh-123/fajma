/**
 * Espace médecin : prescrire des analyses ou un examen d'imagerie lors d'une consultation.
 * Le patient choisit ensuite son laboratoire ou son centre d'imagerie (seuls ceux qui réalisent
 * l'examen demandé lui sont proposés). Pour l'imagerie, les alertes de sécurité sont affichées
 * aussitôt : grossesse et rayons X, appareil implanté et IRM, produit de contraste.
 */
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { FlaskConical, ScanLine } from "lucide-react";
import { toast } from "sonner";
import { getImagingModalities, prescribeLabs } from "@/api/labs";
import type { SafetyResult } from "@/api/safety";
import { SafetyAlerts } from "@/components/pro/SafetyAlerts";

const COMMON_TESTS = [
  "NFS",
  "Glycémie à jeun",
  "HbA1c",
  "Créatininémie",
  "Bilan lipidique",
  "Goutte épaisse (paludisme)",
  "Test de grossesse (β-HCG)",
  "ECBU",
];

const field = "rounded-lg border border-sunu-line bg-sunu-card px-3 py-2 text-sm";
const chip = "rounded-md border border-sunu-line px-2 py-0.5 hover:border-sunu-green";

export function LabOrderAction({ appointmentId }: { appointmentId: string }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"analyses" | "imagerie">("analyses");
  const [modality, setModality] = useState("radio");
  const [contrast, setContrast] = useState(false);
  const [tests, setTests] = useState("");
  const [instructions, setInstructions] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [safety, setSafety] = useState<SafetyResult | null>(null);
  const { data: modalities } = useQuery({
    queryKey: ["imaging-modalities"],
    queryFn: getImagingModalities,
    staleTime: Infinity,
    enabled: open,
  });
  const current = (modalities ?? []).find((m) => m.code === modality);
  const send = useMutation({
    mutationFn: () =>
      prescribeLabs(appointmentId, {
        tests,
        instructions: instructions || undefined,
        urgent,
        kind,
        ...(kind === "imagerie" ? { modality, contrast } : {}),
      }),
    onSuccess: (o) => {
      const where = kind === "imagerie" ? "son centre d'imagerie" : "son laboratoire";
      toast.success(`Prescription enregistrée (réf. ${o.reference}) : le patient choisit ${where}`);
      setSafety(o.safety ?? null);
      // Les alertes restent affichées : la prescription est faite, le médecin doit les lire.
      if (!o.safety?.alerts.length) {
        setOpen(false);
        setTests("");
        setInstructions("");
      }
    },
    onError: (e) => toast.error(e.message),
  });
  const add = (t: string) => setTests(tests ? `${tests}, ${t}` : t);
  const pickModality = (code: string) => {
    setModality(code);
    setContrast(false);
    const m = (modalities ?? []).find((x) => x.code === code);
    if (m?.prep && !instructions) setInstructions(m.prep);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-2 mr-2 inline-flex items-center gap-1 text-xs font-semibold text-sunu-green hover:underline"
      >
        <FlaskConical className="size-3.5" /> Prescrire analyses ou imagerie
      </button>
    );
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        send.mutate();
      }}
      className="mt-2 grid w-full basis-full gap-2 rounded-lg border border-sunu-line p-3 text-xs"
    >
      <div className="flex gap-1 rounded-lg bg-sunu-surface p-1">
        {(
          [
            ["analyses", "Analyses", FlaskConical],
            ["imagerie", "Imagerie", ScanLine],
          ] as const
        ).map(([value, label, Icon]) => (
          <button
            type="button"
            key={value}
            onClick={() => {
              setKind(value);
              setTests("");
              setInstructions("");
              setSafety(null);
            }}
            className={`flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1 font-semibold ${
              kind === value ? "bg-sunu-green text-white" : "text-sunu-ink/70"
            }`}
          >
            <Icon className="size-3.5" /> {label}
          </button>
        ))}
      </div>

      {kind === "imagerie" && (
        <>
          <label className="font-semibold text-sunu-ink/60">
            Type d'examen
            <select
              value={modality}
              onChange={(e) => pickModality(e.target.value)}
              aria-label="Type d'examen d'imagerie"
              className={`mt-0.5 w-full ${field}`}
            >
              {(modalities ?? []).map((m) => (
                <option key={m.code} value={m.code}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          {current?.contrast && (
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={contrast}
                onChange={(e) => setContrast(e.target.checked)}
                className="accent-sunu-green"
              />
              Avec injection d'un produit de contraste
            </label>
          )}
        </>
      )}

      <div className="flex flex-wrap gap-1">
        {(kind === "imagerie" ? (current?.examples ?? []) : COMMON_TESTS).map((t) => (
          <button type="button" key={t} onClick={() => add(t)} className={chip}>
            + {t}
          </button>
        ))}
      </div>
      <textarea
        required
        minLength={3}
        rows={2}
        value={tests}
        onChange={(e) => setTests(e.target.value)}
        placeholder={kind === "imagerie" ? "Examen demandé et indication" : "Analyses demandées"}
        aria-label={kind === "imagerie" ? "Examen demandé" : "Analyses demandées"}
        className={field}
      />
      <input
        value={instructions}
        onChange={(e) => setInstructions(e.target.value)}
        maxLength={300}
        placeholder="Consignes au patient (ex. à jeun depuis 12 h)"
        aria-label="Consignes"
        className={field}
      />
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={urgent}
          onChange={(e) => setUrgent(e.target.checked)}
          className="accent-sunu-green"
        />{" "}
        Urgent
      </label>
      {safety && (
        <SafetyAlerts result={safety} checking={false} override="" onOverride={() => {}} />
      )}
      <div className="flex gap-2">
        <button
          disabled={send.isPending}
          className="rounded-lg bg-sunu-green px-3 py-1.5 font-semibold text-white disabled:opacity-50"
        >
          Prescrire
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setSafety(null);
          }}
          className="px-2 text-sunu-ink/60"
        >
          Fermer
        </button>
      </div>
    </form>
  );
}
