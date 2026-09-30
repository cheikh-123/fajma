/** Espace médecin : code à copier pour afficher la prise de RDV Fajma sur son propre site. */
import { useQuery } from "@tanstack/react-query";
import { Code2, Copy } from "lucide-react";
import { toast } from "sonner";
import { getMyDoctorProfile } from "@/api/doctor";

export function WidgetPanel() {
  const { data: profile } = useQuery({
    queryKey: ["my-doctor-profile"],
    queryFn: getMyDoctorProfile,
  });
  if (!profile) return null;
  const src = `${window.location.origin}/widget/${profile.id}`;
  const code = `<iframe src="${src}" width="360" height="430" style="border:0" title="Prendre rendez-vous sur Fajma" loading="lazy"></iframe>`;
  return (
    <section
      aria-label="Module pour votre site"
      className="rounded-2xl border border-sunu-line bg-sunu-card p-5"
    >
      <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-sunu-ink/50">
        <Code2 className="size-4" /> Prise de RDV sur votre site
      </h2>
      <p className="mt-1 text-xs text-sunu-ink/55">
        Collez ce code sur votre site internet ou votre page de clinique.
      </p>
      <textarea
        readOnly
        aria-label="Code d'intégration"
        value={code}
        rows={4}
        className="mt-2 w-full rounded-lg border border-sunu-line bg-sunu-surface p-2 font-mono text-[11px]"
      />
      <div className="mt-2 flex gap-2">
        <button
          onClick={() =>
            navigator.clipboard.writeText(code).then(() => toast.success("Code copié"))
          }
          className="flex items-center gap-1 rounded-lg border border-sunu-line px-3 py-1.5 text-xs font-semibold text-sunu-ink/70"
        >
          <Copy className="size-3.5" /> Copier
        </button>
        <a
          href={src}
          target="_blank"
          rel="noreferrer"
          className="rounded-lg border border-sunu-line px-3 py-1.5 text-xs font-semibold text-sunu-green"
        >
          Aperçu
        </a>
      </div>
    </section>
  );
}
