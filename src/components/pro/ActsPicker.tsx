/**
 * Codage des actes réalisés pendant la consultation (nomenclature des lettres-clés).
 * Sert à l'organisme du patient (IPM, mutuelle, CMU, assurance) : c'est la base de remboursement.
 * Le prix demandé par le médecin reste libre et indépendant.
 */
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Plus, Receipt, Trash2 } from "lucide-react";
import { getActsCatalog, type ActCatalogItem } from "@/api/acts";

export type ActChoice = { code: string; quantity: number };

const field = "rounded-lg border border-sunu-line bg-sunu-card px-2.5 py-1.5 text-sm";

export function ActsPicker({
  value,
  onChange,
}: {
  value: ActChoice[];
  onChange: (v: ActChoice[]) => void;
}) {
  const { data } = useQuery({
    queryKey: ["acts-catalog"],
    queryFn: getActsCatalog,
    staleTime: 300_000,
  });
  const [pick, setPick] = useState("");
  const acts = data?.acts ?? [];
  const byCode = useMemo(() => new Map(acts.map((a) => [a.code, a])), [acts]);
  const groups = useMemo(() => {
    const out = new Map<string, ActCatalogItem[]>();
    for (const a of acts) out.set(a.group, [...(out.get(a.group) ?? []), a]);
    return [...out.entries()];
  }, [acts]);
  const total = value.reduce(
    (sum, v) => sum + (byCode.get(v.code)?.base_amount ?? 0) * v.quantity,
    0,
  );

  const add = () => {
    if (!pick || value.some((v) => v.code === pick)) return;
    onChange([...value, { code: pick, quantity: 1 }]);
    setPick("");
  };

  return (
    <div className="min-w-0 rounded-xl border border-sunu-line p-3">
      <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-sunu-green">
        <Receipt className="size-3.5" /> Actes réalisés
        <span className="font-normal normal-case text-sunu-ink/50">
          (facultatif — sert au remboursement par l'assurance du patient)
        </span>
      </p>
      <div className="mt-2 flex gap-2">
        <select
          value={pick}
          onChange={(e) => setPick(e.target.value)}
          aria-label="Choisir un acte"
          className={`w-full min-w-0 flex-1 ${field}`}
        >
          <option value="">Choisir un acte…</option>
          {groups.map(([group, items]) => (
            <optgroup key={group} label={group}>
              {items.map((a) => (
                <option key={a.code} value={a.code}>
                  {a.label} — {a.letter} {a.coefficient} ({a.base_amount.toLocaleString("fr-FR")} F)
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <button
          type="button"
          onClick={add}
          disabled={!pick}
          className="flex items-center gap-1 rounded-lg bg-sunu-green px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
        >
          <Plus className="size-3.5" /> Ajouter
        </button>
      </div>
      {value.length > 0 && (
        <ul className="mt-2 divide-y divide-sunu-line">
          {value.map((v) => {
            const a = byCode.get(v.code);
            if (!a) return null;
            return (
              <li key={v.code} className="flex items-center gap-2 py-1.5 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sunu-dark">{a.label}</span>
                  <span className="text-xs text-sunu-ink/50">
                    {a.letter} {a.coefficient} · {a.base_amount.toLocaleString("fr-FR")} F
                  </span>
                </span>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={v.quantity}
                  aria-label={`Nombre de fois : ${a.label}`}
                  onChange={(e) =>
                    onChange(
                      value.map((x) =>
                        x.code === v.code
                          ? {
                              ...x,
                              quantity: Math.max(1, Math.min(20, Number(e.target.value) || 1)),
                            }
                          : x,
                      ),
                    )
                  }
                  className={`w-16 ${field}`}
                />
                <button
                  type="button"
                  onClick={() => onChange(value.filter((x) => x.code !== v.code))}
                  aria-label={`Retirer ${a.label}`}
                  className="text-sunu-ink/40 hover:text-red-600"
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {total > 0 && (
        <p className="mt-2 text-xs text-sunu-ink/70">
          Base de remboursement :{" "}
          <b className="text-sunu-dark">{total.toLocaleString("fr-FR")} F</b> — votre tarif reste
          libre.
        </p>
      )}
    </div>
  );
}
