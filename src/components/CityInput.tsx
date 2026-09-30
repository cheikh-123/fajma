/**
 * Champ « Où ? » : suggestions des villes et quartiers du Sénégal pendant la saisie (Pikine, Touba…)
 * et bouton « Autour de moi » (position du téléphone).
 */
import { useQuery } from "@tanstack/react-query";
import { useEffect, useId, useState } from "react";
import { LocateFixed, Loader2, MapPin } from "lucide-react";
import { toast } from "sonner";
import { listLocalities } from "@/api/directory";
import { useI18n } from "@/lib/i18n";

type Props = {
  value: string;
  onChange: (value: string) => void;
  /** Localité choisie dans la liste (déclenche la recherche). */
  onPick: (name: string) => void;
  /** Position GPS obtenue par « Autour de moi ». */
  onNearMe: (lat: number, lng: number) => void;
  placeholder?: string;
  className?: string;
};

export function CityInput({
  value,
  onChange,
  onPick,
  onNearMe,
  placeholder,
  className = "",
}: Props) {
  const { t } = useI18n();
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [debounced, setDebounced] = useState(value);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), 200);
    return () => clearTimeout(timer);
  }, [value]);
  const { data: suggestions = [] } = useQuery({
    queryKey: ["localities", debounced.trim().toLowerCase()],
    queryFn: () => listLocalities(debounced.trim()),
    enabled: open && debounced.trim().length >= 2,
    staleTime: Infinity,
  });
  const shown = open ? suggestions : [];

  const pick = (name: string) => {
    onChange(name);
    setOpen(false);
    setActive(-1);
    onPick(name);
  };

  const locate = () => {
    if (!navigator.geolocation) return toast.error(t("search.geoDenied"));
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        onNearMe(pos.coords.latitude, pos.coords.longitude);
      },
      () => {
        setLocating(false);
        toast.error(t("search.geoDenied"));
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  };

  return (
    <div className={`relative flex flex-1 items-center gap-2 ${className}`}>
      <MapPin className="size-4 shrink-0 text-sunu-green" />
      <input
        value={value}
        role="combobox"
        aria-expanded={shown.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-label={t("search.city")}
        autoComplete="off"
        placeholder={placeholder ?? t("search.cityPh")}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (!shown.length) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => Math.min(i + 1, shown.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter" && active >= 0) {
            e.preventDefault();
            pick(shown[active].name);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        className="w-full bg-transparent text-sm outline-none placeholder:text-sunu-ink/40"
      />
      <button
        type="button"
        onClick={locate}
        title={t("search.nearMe")}
        className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-sunu-green hover:bg-sunu-green-soft"
      >
        {locating ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <LocateFixed className="size-3.5" />
        )}
        <span className="hidden sm:inline">
          {locating ? t("search.locating") : t("search.nearMe")}
        </span>
      </button>
      {shown.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-xl border border-sunu-line bg-sunu-card text-left shadow-sunu-card"
        >
          {shown.map((s, i) => (
            <li
              key={s.name}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(s.name);
              }}
              className={`flex cursor-pointer items-center justify-between px-4 py-2 text-sm ${i === active ? "bg-sunu-green-soft" : "hover:bg-sunu-surface"}`}
            >
              {/* « Colobane (Fatick) » : la région est déjà affichée à droite. */}
              <span className="font-medium text-sunu-dark">
                {s.name.replace(` (${s.region})`, "")}
              </span>
              <span className="text-xs text-sunu-ink/50">{s.region}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
