/**
 * Fiche d'urgence du patient : activation, choix des informations visibles, QR code à mettre en fond
 * d'écran ou dans le portefeuille, nouveau lien (l'ancien QR code cesse de fonctionner).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, ExternalLink, Loader2, QrCode, RefreshCw, Siren } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { getEmergencySettings, updateEmergencySettings, type EmergencyField } from "@/api/followup";
import { useMe } from "@/api/auth";

const FIELDS: { id: EmergencyField; label: string; hint: string }[] = [
  { id: "blood_group", label: "Groupe sanguin", hint: "utile en cas de transfusion" },
  { id: "allergies", label: "Allergies", hint: "médicaments, aliments" },
  { id: "treatments", label: "Traitements en cours", hint: "anticoagulants, insuline…" },
  { id: "conditions", label: "Antécédents et maladies", hint: "diabète, épilepsie, asthme…" },
  { id: "emergency_contact", label: "Personne à prévenir", hint: "nom et téléphone" },
];

export function EmergencyCardSection() {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const { data } = useQuery({ queryKey: ["emergency-card"], queryFn: getEmergencySettings });
  const [qr, setQr] = useState<string | null>(null);
  const url =
    data?.enabled && data.token && typeof window !== "undefined"
      ? `${window.location.origin}/urgence/${data.token}`
      : null;

  useEffect(() => {
    if (!url) return setQr(null);
    QRCode.toDataURL(url, { margin: 1, width: 480, errorCorrectionLevel: "M" })
      .then(setQr)
      .catch(() => setQr(null));
  }, [url]);

  const update = useMutation({
    mutationFn: updateEmergencySettings,
    onSuccess: (res, vars) => {
      qc.setQueryData(["emergency-card"], res);
      if (vars.regenerate)
        toast.success("Nouveau lien créé : l'ancien QR code ne fonctionne plus.");
      else if (vars.enabled === true) toast.success("Fiche d'urgence activée");
      else if (vars.enabled === false) toast.success("Fiche d'urgence désactivée");
    },
    onError: (e) => toast.error(e.message),
  });

  const toggleField = (id: EmergencyField) => {
    if (!data) return;
    const fields = data.fields.includes(id)
      ? data.fields.filter((f) => f !== id)
      : [...data.fields, id];
    update.mutate({ fields });
  };

  const downloadImage = async () => {
    if (!qr) return;
    // Image au format écran de téléphone (fond d'écran de verrouillage) ou à imprimer.
    const canvas = document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = 1920;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 1080, 1920);
    ctx.fillStyle = "#e31b23";
    ctx.fillRect(0, 0, 1080, 360);
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.font = "bold 88px sans-serif";
    ctx.fillText("URGENCE MÉDICALE", 540, 190);
    ctx.font = "44px sans-serif";
    ctx.fillText("Scannez ce code pour ma fiche", 540, 280);
    const img = new Image();
    img.src = qr;
    await img.decode();
    ctx.drawImage(img, 190, 520, 700, 700);
    ctx.fillStyle = "#0f1a14";
    ctx.font = "bold 64px sans-serif";
    ctx.fillText(me?.full_name ?? "", 540, 1360);
    ctx.font = "44px sans-serif";
    ctx.fillStyle = "#56645b";
    ctx.fillText("Allergies, traitements, personne à prévenir", 540, 1440);
    ctx.fillStyle = "#e31b23";
    ctx.font = "bold 60px sans-serif";
    ctx.fillText("SAMU : 1515", 540, 1640);
    ctx.fillStyle = "#00853f";
    ctx.font = "bold 44px sans-serif";
    ctx.fillText("Fajma", 540, 1800);
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = "fiche-urgence-fajma.png";
    a.click();
  };

  if (!data) return null;
  return (
    <section>
      <h2 className="flex items-center gap-2 text-lg font-bold text-sunu-dark">
        <Siren className="size-5 text-red-600" /> Fiche d'urgence
      </h2>
      <div className="mt-3 rounded-xl border border-sunu-line bg-sunu-card p-5">
        <p className="text-sm text-sunu-ink/70">
          En cas d'accident ou de malaise, les secours scannent le QR code (sur votre fond d'écran
          ou une carte dans votre portefeuille) et voient les informations que vous choisissez ici,
          sans accès à votre dossier. Complétez d'abord votre profil de santé ci-dessus.
        </p>
        <label className="mt-4 flex items-center justify-between gap-3 rounded-lg bg-sunu-surface px-3 py-2.5 text-sm font-semibold text-sunu-dark">
          Activer ma fiche d'urgence
          <input
            type="checkbox"
            checked={data.enabled}
            disabled={update.isPending}
            onChange={(e) => update.mutate({ enabled: e.target.checked })}
            className="size-5 accent-sunu-green"
          />
        </label>

        {data.enabled && (
          <div className="mt-4 grid gap-5 md:grid-cols-[1fr_auto]">
            <fieldset>
              <legend className="text-xs font-semibold text-sunu-ink/60">
                Informations visibles par les secours (en plus de votre nom et de votre âge)
              </legend>
              <div className="mt-2 grid gap-1.5">
                {FIELDS.map((f) => (
                  <label key={f.id} className="flex items-start gap-2 text-sm text-sunu-ink/80">
                    <input
                      type="checkbox"
                      checked={data.fields.includes(f.id)}
                      onChange={() => toggleField(f.id)}
                      disabled={update.isPending}
                      className="mt-0.5 size-4 accent-sunu-green"
                    />
                    <span>
                      {f.label} <span className="text-xs text-sunu-ink/50">— {f.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  onClick={downloadImage}
                  disabled={!qr}
                  className="flex items-center gap-1.5 rounded-lg bg-sunu-green px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                >
                  <Download className="size-3.5" /> Télécharger l'image (fond d'écran)
                </button>
                {url && (
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 rounded-lg border border-sunu-line px-3 py-2 text-xs font-semibold text-sunu-ink/70 hover:border-sunu-green hover:text-sunu-green"
                  >
                    <ExternalLink className="size-3.5" /> Voir ce que voient les secours
                  </a>
                )}
                <button
                  onClick={() => {
                    if (
                      window.confirm(
                        "Créer un nouveau lien ? L'ancien QR code (image, carte imprimée) ne fonctionnera plus.",
                      )
                    )
                      update.mutate({ regenerate: true });
                  }}
                  disabled={update.isPending}
                  className="flex items-center gap-1.5 rounded-lg border border-sunu-line px-3 py-2 text-xs font-semibold text-sunu-ink/70 hover:text-red-600"
                >
                  <RefreshCw className="size-3.5" /> Nouveau lien
                </button>
              </div>
              <p className="mt-3 text-[11px] text-sunu-ink/50">
                Chaque consultation de la fiche est enregistrée et vous êtes prévenu. Perte de
                téléphone ou de carte : créez un nouveau lien.
              </p>
            </fieldset>
            <div className="flex flex-col items-center justify-center rounded-xl border border-sunu-line bg-white p-3">
              {qr ? (
                <img src={qr} alt="QR code de ma fiche d'urgence" className="size-40" />
              ) : (
                <Loader2 className="size-6 animate-spin text-sunu-ink/40" />
              )}
              <span className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-gray-600">
                <QrCode className="size-3.5" /> Fiche d'urgence
              </span>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
