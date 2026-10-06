/**
 * Administration : partenaires et campagnes sponsorisées. Une campagne n'est diffusée qu'après validation et
 * vérification de la charte ; statistiques agrégées (affichages, clics) et rapport pour l'annonceur.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Download, Handshake, Megaphone } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/api/client";
import { fileToBase64 } from "@/lib/file-base64";

type Partner = { id: string; name: string; kind: string; kind_label: string; is_public: boolean };
type Campaign = {
  id: string;
  partner_id: string;
  partner: { name: string };
  title: string;
  body: string;
  category_label: string;
  placements: string[];
  cities: string[];
  starts_on: string;
  ends_on: string;
  status: "draft" | "approved" | "paused";
  status_label: string;
  impressions: number;
  clicks: number;
  ctr: number | null;
};

const KINDS = [
  ["assureur", "Assurance, IPM, mutuelle"],
  ["operateur", "Opérateur, paiement"],
  ["pharmacie", "Pharmacie, laboratoire"],
  ["institution", "Institution publique"],
  ["ong", "ONG, fondation"],
  ["entreprise", "Entreprise"],
  ["autre", "Autre"],
];
const PLACES = [
  ["home", "Accueil"],
  ["search", "Recherche de médecins"],
  ["patient", "Espace patient"],
];

export function PartnersAdmin() {
  const qc = useQueryClient();
  const { data: partners } = useQuery({
    queryKey: ["admin-partners"],
    queryFn: () => api.get<Partner[]>("/admin/partners"),
  });
  const { data: campaigns } = useQuery({
    queryKey: ["admin-campaigns"],
    queryFn: () => api.get<Campaign[]>("/admin/campaigns"),
  });
  const today = new Date().toISOString().slice(0, 10);
  const [p, setP] = useState({
    name: "",
    kind: "assureur",
    description: "",
    website: "",
    is_public: true,
  });
  const [logo, setLogo] = useState<File | null>(null);
  const [visual, setVisual] = useState<File | null>(null);
  const [c, setC] = useState({
    partner_id: "",
    title: "",
    body: "",
    cta_label: "En savoir plus",
    cta_url: "",
    category: "prevention",
    theme: "vert",
    placements: ["home"] as string[],
    cities: "",
    starts_on: today,
    ends_on: today,
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin-partners"] });
    qc.invalidateQueries({ queryKey: ["admin-campaigns"] });
  };
  const savePartner = useMutation({
    mutationFn: async () =>
      api.post("/admin/partners", {
        ...p,
        website: p.website || undefined,
        logo: logo ? { file_name: logo.name, content_base64: await fileToBase64(logo) } : undefined,
      }),
    onSuccess: () => {
      toast.success("Partenaire enregistré");
      setP({ name: "", kind: "assureur", description: "", website: "", is_public: true });
      setLogo(null);
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const saveCampaign = useMutation({
    mutationFn: async () =>
      api.post("/admin/campaigns", {
        ...c,
        image: visual
          ? { file_name: visual.name, content_base64: await fileToBase64(visual) }
          : undefined,
        cities: c.cities
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),
      }),
    onSuccess: () => {
      toast.success("Campagne enregistrée en brouillon : validez-la après contrôle de la charte");
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const setStatus = useMutation({
    mutationFn: (v: { id: string; status: string; charter_checked?: boolean }) =>
      api.post(`/admin/campaigns/${v.id}/status`, v),
    onSuccess: refresh,
    onError: (e) => toast.error(e.message),
  });
  const field = "rounded-lg border border-sunu-line bg-sunu-card px-3 py-2 text-sm";

  return (
    <section className="rounded-xl border border-sunu-line bg-sunu-card p-5">
      <h2 className="flex items-center gap-2 font-bold text-sunu-dark">
        <Handshake className="size-5 text-sunu-green" /> Partenaires et campagnes
      </h2>
      <p className="mt-1 text-xs text-sunu-ink/55">
        Charte : prévention, assurances, produits sans ordonnance ; jamais de médicament sur
        ordonnance, de promesse de guérison ni de médecin mis en avant contre paiement ; ciblage par
        ville et langue seulement ; mention « Sponsorisé » automatique.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          savePartner.mutate();
        }}
        className="mt-4 grid gap-2 rounded-lg bg-sunu-surface p-3 sm:grid-cols-3"
      >
        <input
          required
          value={p.name}
          onChange={(e) => setP({ ...p, name: e.target.value })}
          placeholder="Nom du partenaire"
          aria-label="Nom du partenaire"
          className={field}
        />
        <select
          value={p.kind}
          onChange={(e) => setP({ ...p, kind: e.target.value })}
          aria-label="Type"
          className={field}
        >
          {KINDS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <input
          value={p.website}
          onChange={(e) => setP({ ...p, website: e.target.value })}
          placeholder="https://…"
          aria-label="Site web"
          className={field}
        />
        <input
          value={p.description}
          onChange={(e) => setP({ ...p, description: e.target.value })}
          placeholder="Description"
          aria-label="Description"
          className={`${field} sm:col-span-2`}
        />
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => setLogo(e.target.files?.[0] ?? null)}
          aria-label="Logo"
          className="text-xs"
        />
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={p.is_public}
            onChange={(e) => setP({ ...p, is_public: e.target.checked })}
          />
          Afficher sur « Nos partenaires »
        </label>
        <button className="rounded-lg bg-sunu-green px-3 py-2 text-xs font-semibold text-white sm:col-span-2">
          Ajouter le partenaire
        </button>
      </form>
      <p className="mt-2 text-xs text-sunu-ink/60">
        {(partners ?? []).map((x) => x.name).join(" · ") || "Aucun partenaire."}
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          saveCampaign.mutate();
        }}
        className="mt-4 grid gap-2 rounded-lg bg-sunu-surface p-3 sm:grid-cols-2"
      >
        <h3 className="flex items-center gap-1.5 text-sm font-bold sm:col-span-2">
          <Megaphone className="size-4" /> Nouvelle campagne
        </h3>
        <select
          required
          value={c.partner_id}
          onChange={(e) => setC({ ...c, partner_id: e.target.value })}
          aria-label="Partenaire"
          className={field}
        >
          <option value="">Partenaire…</option>
          {(partners ?? []).map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
        <select
          value={c.category}
          onChange={(e) => setC({ ...c, category: e.target.value })}
          aria-label="Catégorie"
          className={field}
        >
          <option value="prevention">Prévention / santé publique</option>
          <option value="assurance">Assurance, mutuelle</option>
          <option value="service">Service de santé</option>
          <option value="produit">Produit sans ordonnance</option>
        </select>
        <input
          required
          maxLength={80}
          value={c.title}
          onChange={(e) => setC({ ...c, title: e.target.value })}
          placeholder="Titre (80 caractères)"
          aria-label="Titre"
          className={field}
        />
        <input
          required
          maxLength={200}
          value={c.body}
          onChange={(e) => setC({ ...c, body: e.target.value })}
          placeholder="Texte (200 caractères)"
          aria-label="Texte"
          className={field}
        />
        <input
          maxLength={30}
          value={c.cta_label}
          onChange={(e) => setC({ ...c, cta_label: e.target.value })}
          placeholder="Bouton"
          aria-label="Bouton"
          className={field}
        />
        <input
          required
          value={c.cta_url}
          onChange={(e) => setC({ ...c, cta_url: e.target.value })}
          placeholder="Lien https://… ou /page"
          aria-label="Lien"
          className={field}
        />
        <select
          value={c.theme}
          onChange={(e) => setC({ ...c, theme: e.target.value })}
          aria-label="Couleur de la campagne"
          className={field}
        >
          <option value="vert">Couleur : vert Fajma</option>
          <option value="rose">Couleur : rose (Octobre rose)</option>
          <option value="bleu">Couleur : bleu (Novembre bleu, diabète)</option>
          <option value="orange">Couleur : orange</option>
          <option value="violet">Couleur : violet</option>
          <option value="rouge">Couleur : rouge (VIH, don de sang)</option>
        </select>
        <label className="flex items-center gap-2 text-xs">
          Visuel du bandeau (photo ou illustration, format large)
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => setVisual(e.target.files?.[0] ?? null)}
          />
        </label>
        <input
          value={c.cities}
          onChange={(e) => setC({ ...c, cities: e.target.value })}
          placeholder="Villes (séparées par des virgules ; vide : tout le pays)"
          aria-label="Villes"
          className={`${field} sm:col-span-2`}
        />
        <div className="flex flex-wrap gap-3 text-xs sm:col-span-2">
          {PLACES.map(([v, l]) => (
            <label key={v} className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={c.placements.includes(v)}
                onChange={(e) =>
                  setC({
                    ...c,
                    placements: e.target.checked
                      ? [...c.placements, v]
                      : c.placements.filter((x) => x !== v),
                  })
                }
              />
              {l}
            </label>
          ))}
          <label className="flex items-center gap-1.5">
            Du{" "}
            <input
              type="date"
              value={c.starts_on}
              onChange={(e) => setC({ ...c, starts_on: e.target.value })}
              className={field}
            />
          </label>
          <label className="flex items-center gap-1.5">
            au{" "}
            <input
              type="date"
              value={c.ends_on}
              onChange={(e) => setC({ ...c, ends_on: e.target.value })}
              className={field}
            />
          </label>
        </div>
        <button className="rounded-lg bg-sunu-green px-3 py-2 text-xs font-semibold text-white sm:col-span-2">
          Enregistrer en brouillon
        </button>
      </form>

      <ul className="mt-4 divide-y divide-sunu-line text-sm">
        {(campaigns ?? []).map((x) => (
          <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
            <div className="min-w-0">
              <p className="font-semibold text-sunu-dark">
                {x.title}{" "}
                <span className="text-xs font-normal text-sunu-ink/55">
                  · {x.partner.name} · {x.category_label}
                </span>
              </p>
              <p className="text-xs text-sunu-ink/55">
                {x.status_label} · {x.starts_on} → {x.ends_on} · {x.impressions} affichages ·{" "}
                {x.clicks} clics
                {x.ctr != null ? ` (${x.ctr} %)` : ""}
              </p>
            </div>
            <span className="flex items-center gap-2 text-xs">
              {x.status !== "approved" ? (
                <button
                  onClick={() => {
                    if (
                      window.confirm(
                        "Vérifié : conforme à la charte (pas de médicament sur ordonnance, pas de promesse de guérison, message exact) ?",
                      )
                    )
                      setStatus.mutate({ id: x.id, status: "approved", charter_checked: true });
                  }}
                  className="rounded-lg bg-sunu-green px-3 py-1.5 font-semibold text-white"
                >
                  Valider
                </button>
              ) : (
                <button
                  onClick={() => setStatus.mutate({ id: x.id, status: "paused" })}
                  className="rounded-lg border border-sunu-line px-3 py-1.5 font-semibold"
                >
                  Suspendre
                </button>
              )}
              <a
                href={`/api/admin/campaigns/${x.id}/report.csv`}
                className="flex items-center gap-1 font-semibold text-sunu-green"
              >
                <Download className="size-3.5" /> Rapport
              </a>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
