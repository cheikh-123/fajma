/**
 * Diagnostic principal codé (CIM-10), en plus du texte libre : alimente la veille épidémiologique et la
 * déclaration des maladies à déclaration immédiate au district sanitaire (choléra, rougeole, méningite…).
 */
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AlertTriangle, Search } from "lucide-react";
import { api } from "@/api/client";

export type ConditionValue = {
  condition_code: string;
  condition_status: string;
  test_result: string;
};
type Condition = {
  code: string;
  label: string;
  group: string;
  icd10: string;
  notify: string;
  test: string;
};
type Catalog = {
  conditions: Condition[];
  statuses: Record<string, string>;
  test_results: Record<string, string>;
  hotline: string | null;
};

export const emptyCondition: ConditionValue = {
  condition_code: "",
  condition_status: "",
  test_result: "",
};

export function ConditionPicker({
  value,
  onChange,
}: {
  value: ConditionValue;
  onChange: (v: ConditionValue) => void;
}) {
  const { data } = useQuery({
    queryKey: ["conditions"],
    queryFn: () => api.get<Catalog>("/pro/conditions"),
    staleTime: Infinity,
  });
  const [q, setQ] = useState("");
  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const map = new Map<string, Condition[]>();
    for (const c of data?.conditions ?? []) {
      if (needle && !`${c.label} ${c.icd10}`.toLowerCase().includes(needle)) continue;
      map.set(c.group, [...(map.get(c.group) ?? []), c]);
    }
    return [...map.entries()];
  }, [data, q]);
  if (!data) return null;
  const selected = data.conditions.find((c) => c.code === value.condition_code);
  const field = "rounded-lg border border-sunu-line bg-sunu-card px-2 py-1.5 text-sm";

  return (
    <fieldset className="grid gap-2 rounded-xl border border-sunu-line p-3">
      <legend className="px-1 text-xs font-semibold text-sunu-ink/60">
        Diagnostic principal (veille sanitaire, facultatif)
      </legend>
      <div className="flex flex-wrap gap-2">
        <label className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg border border-sunu-line px-2">
          <Search className="size-3.5 text-sunu-ink/40" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Chercher (hépatite, palu, B16…)"
            aria-label="Chercher un diagnostic"
            className="min-w-0 flex-1 bg-transparent py-1.5 text-sm outline-none"
          />
        </label>
        <select
          value={value.condition_code}
          onChange={(e) =>
            onChange({
              condition_code: e.target.value,
              condition_status: e.target.value ? value.condition_status || "suspected" : "",
              test_result: e.target.value ? value.test_result : "",
            })
          }
          aria-label="Diagnostic principal"
          className={`${field} min-w-0 flex-1`}
        >
          <option value="">— Aucun —</option>
          {groups.map(([group, items]) => (
            <optgroup key={group} label={group}>
              {items.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                  {c.icd10 ? ` (${c.icd10})` : ""}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
      {selected && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <select
            value={value.condition_status}
            onChange={(e) => onChange({ ...value, condition_status: e.target.value })}
            aria-label="Certitude"
            className={field}
          >
            {Object.entries(data.statuses).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          {selected.test && (
            <label className="flex items-center gap-1.5">
              {selected.test} :
              <select
                value={value.test_result}
                onChange={(e) => onChange({ ...value, test_result: e.target.value })}
                aria-label="Résultat du test"
                className={field}
              >
                <option value="">—</option>
                {Object.entries(data.test_results).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}
      {selected?.notify === "immediate" && value.test_result !== "negative" && (
        <p className="flex gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-800">
          <AlertTriangle className="size-4 shrink-0" />
          Maladie à déclaration immédiate : déclarez ce cas au district sanitaire dès maintenant
          {data.hotline ? ` (${data.hotline})` : ""}. L'équipe Fajma est prévenue ; indiquez ensuite
          la déclaration dans « Déclarations à faire ».
        </p>
      )}
      {selected?.notify === "weekly" && (
        <p className="text-xs text-sunu-ink/55">
          Compté dans le rapport hebdomadaire de surveillance (anonyme).
        </p>
      )}
    </fieldset>
  );
}
