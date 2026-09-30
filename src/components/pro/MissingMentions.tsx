/** Alerte tant que l'en-tête des ordonnances est incomplet (n° d'Ordre, signature) : sans lui, pas d'ordonnance. */
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { getPrescriptionHeader } from "@/api/doctor";

export function MissingMentions({ compact = false }: { compact?: boolean }) {
  const { data } = useQuery({
    queryKey: ["pro-prescription-header"],
    queryFn: getPrescriptionHeader,
  });
  if (!data?.missing.length) return null;
  return (
    <div
      role="alert"
      className={`flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 text-amber-900 ${compact ? "mb-3 px-3 py-2 text-xs" : "mt-6 px-4 py-3 text-sm"}`}
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <p>
        {compact
          ? "Ordonnances et certificats impossibles pour l'instant (le compte-rendu seul peut être enregistré) : il manque "
          : "Vous ne pouvez pas encore délivrer d'ordonnances ni de certificats : il manque "}
        <b>{data.missing.join(", ")}</b>.{" "}
        <Link to="/pro" search={{ onglet: "ordonnances" }} className="font-semibold underline">
          Compléter mon en-tête
        </Link>
      </p>
    </div>
  );
}
