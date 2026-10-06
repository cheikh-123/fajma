/** Recherche globale de l'administration : un nom, un téléphone, une référence d'ordonnance ou de reçu. */
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { adminSearch, type SearchResult } from "@/api/backoffice";

const TYPE_LABEL: Record<SearchResult["type"], string> = {
  user: "Compte",
  doctor: "Médecin",
  clinic: "Établissement",
  pharmacy: "Pharmacie",
  lab: "Laboratoire",
  prescription: "Ordonnance",
  payment: "Paiement",
};

export function GlobalSearch({ onPick }: { onPick: (r: SearchResult) => void }) {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  const { data, isFetching } = useQuery({
    queryKey: ["admin-search", debounced],
    queryFn: () => adminSearch(debounced),
    enabled: debounced.length >= 2,
  });
  const results = data?.results ?? [];
  return (
    <div className="relative w-full max-w-md">
      <label className="flex items-center gap-2 rounded-lg border border-sunu-line bg-sunu-surface px-3">
        <Search className="size-4 text-sunu-ink/40" />
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
          placeholder="Rechercher : nom, téléphone, n° d'ordonnance, reçu…"
          aria-label="Recherche globale"
          className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none"
        />
      </label>
      {open && debounced.length >= 2 && (
        <div className="absolute left-0 right-0 top-full z-40 mt-1 max-h-96 overflow-y-auto rounded-xl border border-sunu-line bg-sunu-card p-1 shadow-lg">
          {results.length === 0 ? (
            <p className="px-3 py-4 text-center text-sm text-sunu-ink/50">
              {isFetching ? "Recherche…" : "Aucun résultat."}
            </p>
          ) : (
            results.map((r) => (
              <button
                key={`${r.type}-${r.id}`}
                onMouseDown={() => {
                  onPick(r);
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left hover:bg-sunu-surface"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-sunu-dark">
                    {r.label}
                  </span>
                  <span className="block truncate text-xs text-sunu-ink/55">{r.sub}</span>
                </span>
                <span className="shrink-0 rounded-full bg-sunu-surface px-2 py-0.5 text-[11px] font-semibold text-sunu-ink/60">
                  {TYPE_LABEL[r.type]}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
