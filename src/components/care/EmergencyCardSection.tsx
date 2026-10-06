/**
 * Fiche d'urgence : la sienne et celle de chaque proche (enfant, parent âgé). Alertes vitales, personnes à
 * prévenir (3), appareils médicaux, note pour les secours, choix des informations visibles ; QR code en fond
 * d'écran ou sur une carte de portefeuille à imprimer ; nouveau lien (l'ancien QR code cesse de fonctionner).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CreditCard,
  Download,
  ExternalLink,
  Loader2,
  Plus,
  QrCode,
  RefreshCw,
  Siren,
  Trash2,
} from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useMe } from "@/api/auth";
import {
  getEmergencySettings,
  updateEmergencySettings,
  type EmergencyContact,
  type EmergencyField,
  type EmergencySettings,
  type EmergencyUpdate,
} from "@/api/followup";
import { listMyRelatives } from "@/api/patient";
import { FLAG_LABELS } from "@/lib/emergency-labels";

const FIELDS: { id: EmergencyField; label: string; hint: string }[] = [
  { id: "critical_flags", label: "Alertes vitales", hint: "affichées en gros, en tête" },
  { id: "blood_group", label: "Groupe sanguin", hint: "utile en cas de transfusion" },
  { id: "allergies", label: "Allergies", hint: "médicaments, aliments" },
  { id: "treatments", label: "Traitements en cours", hint: "anticoagulants, insuline…" },
  { id: "conditions", label: "Antécédents et maladies", hint: "opérations, maladies" },
  { id: "medical_devices", label: "Appareils médicaux", hint: "pacemaker, prothèse…" },
  { id: "emergency_contact", label: "Personnes à prévenir", hint: "appel en un geste" },
  { id: "doctor", label: "Médecin traitant", hint: "dernier médecin consulté, avec son téléphone" },
  { id: "insurance", label: "Assurance", hint: "IPM, mutuelle, n° d'adhérent pour l'hôpital" },
  { id: "weight", label: "Poids", hint: "dernière mesure, utile pour les doses" },
  { id: "rescuer_notes", label: "Note pour les secours", hint: "langue parlée, handicap…" },
  {
    id: "medical_summary",
    label: "Résumé de mes médecins",
    hint: "conclusions des 3 dernières consultations et ordonnances en cours ; jamais les notes privées ni les diagnostics sensibles (VIH, IST, santé mentale)",
  },
];
const FIELD_LABEL = Object.fromEntries(FIELDS.map((f) => [f.id, f.label]));
const BLOOD = ["", "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

export function EmergencyCardSection() {
  const { data: relatives } = useQuery({
    queryKey: ["my-relatives"],
    queryFn: () => listMyRelatives(),
  });
  const [who, setWho] = useState<string>("");
  return (
    <section>
      <h2 className="flex items-center gap-2 text-lg font-bold text-sunu-dark">
        <Siren className="size-5 text-red-600" /> Fiche d'urgence
      </h2>
      <p className="mt-1 text-sm text-sunu-ink/65">
        En cas d'accident ou de malaise, les secours scannent le QR code (fond d'écran du téléphone
        ou carte dans le portefeuille) et voient seulement ce que vous choisissez ici, en français,
        wolof ou anglais, avec les numéros à appeler.
      </p>
      {(relatives ?? []).length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Fiche de">
          {[{ id: "", full_name: "Moi" }, ...(relatives ?? [])].map((r) => (
            <button
              key={r.id || "me"}
              onClick={() => setWho(r.id)}
              aria-pressed={who === r.id}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${who === r.id ? "bg-red-600 text-white" : "bg-sunu-card text-sunu-ink/70 ring-1 ring-sunu-line"}`}
            >
              {r.full_name}
            </button>
          ))}
        </div>
      )}
      <CardEditor key={who || "me"} relativeId={who || undefined} />
    </section>
  );
}

function CardEditor({ relativeId }: { relativeId?: string }) {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const key = ["emergency-card", relativeId ?? "me"];
  const { data } = useQuery({ queryKey: key, queryFn: () => getEmergencySettings(relativeId) });
  const [qr, setQr] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<EmergencySettings>>({});
  useEffect(() => {
    if (data) setDraft({});
  }, [data]);
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
    mutationFn: (v: EmergencyUpdate) => updateEmergencySettings({ ...v, relative_id: relativeId }),
    onSuccess: (res, vars) => {
      qc.setQueryData(key, res);
      if (vars.regenerate)
        toast.success("Nouveau lien créé : l'ancien QR code ne fonctionne plus.");
      else if (vars.enabled === true) toast.success("Fiche d'urgence activée");
      else if (vars.enabled === false) toast.success("Fiche d'urgence désactivée");
      else toast.success("Fiche d'urgence enregistrée");
    },
    onError: (e) => toast.error(e.message),
  });
  if (!data) return <Loader2 className="mt-4 size-5 animate-spin text-sunu-ink/40" />;
  const name = data.relative?.full_name ?? me?.full_name ?? "";
  const val = <K extends keyof EmergencySettings>(k: K) =>
    (draft[k] ?? data[k]) as EmergencySettings[K];
  const contacts: EmergencyContact[] = val("contacts") ?? [];
  const setContacts = (c: EmergencyContact[]) => setDraft({ ...draft, contacts: c });
  const flags = val("critical_flags") ?? [];
  const dirty = Object.keys(draft).length > 0;
  const field = "w-full rounded-lg border border-sunu-line bg-sunu-card px-3 py-2 text-sm";

  const toggleField = (id: EmergencyField) =>
    update.mutate({
      fields: data.fields.includes(id) ? data.fields.filter((f) => f !== id) : [...data.fields, id],
    });

  const downloadImage = async () => {
    if (!qr) return;
    const canvas = document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = 1920;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 1080, 1920);
    ctx.fillStyle = "#dc2626";
    ctx.fillRect(0, 0, 1080, 360);
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.font = "bold 88px sans-serif";
    ctx.fillText("URGENCE MÉDICALE", 540, 190);
    ctx.font = "44px sans-serif";
    ctx.fillText("Scannez ce code · Scannez kood bii", 540, 280);
    const img = new Image();
    img.src = qr;
    await img.decode();
    ctx.drawImage(img, 190, 470, 700, 700);
    ctx.fillStyle = "#0f1a14";
    ctx.font = "bold 64px sans-serif";
    ctx.fillText(name, 540, 1290);
    ctx.fillStyle = "#b91c1c";
    ctx.font = "bold 40px sans-serif";
    flags.slice(0, 3).forEach((f, i) => ctx.fillText(FLAG_LABELS[f]?.fr ?? f, 540, 1370 + i * 56));
    ctx.font = "bold 60px sans-serif";
    ctx.fillText("SAMU : 1515", 540, 1650);
    ctx.fillStyle = "#00853f";
    ctx.font = "bold 44px sans-serif";
    ctx.fillText("Fajma", 540, 1800);
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = "fiche-urgence-fajma.png";
    a.click();
  };

  /** Carte au format carte bancaire (85,6 × 54 mm), recto et verso, à imprimer et plastifier. */
  const printWalletCard = () => {
    if (!qr) return;
    const w = window.open("", "_blank", "width=700,height=600");
    if (!w) return;
    const d = w.document;
    d.title = "Carte d'urgence";
    const style = d.createElement("style");
    style.textContent = `@page{margin:10mm}body{font-family:Arial,sans-serif;display:flex;gap:6mm;flex-wrap:wrap}
      .c{width:85.6mm;height:54mm;border:0.3mm solid #999;border-radius:3mm;overflow:hidden;box-sizing:border-box;position:relative}
      .h{background:#dc2626;color:#fff;font-weight:bold;font-size:3.6mm;padding:2mm 3mm}
      .b{padding:2mm 3mm;font-size:2.8mm;line-height:1.35}.q{position:absolute;right:2.5mm;bottom:2.5mm;width:26mm;height:26mm}
      .n{font-weight:bold;font-size:3.6mm}.f{color:#b91c1c;font-weight:bold}.s{color:#b91c1c;font-weight:bold;font-size:3.4mm}`;
    d.head.appendChild(style);
    const card = (html: string) => {
      const el = d.createElement("div");
      el.className = "c";
      el.innerHTML = html;
      d.body.appendChild(el);
    };
    const esc = (t: string) =>
      t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
    card(
      `<div class="h">URGENCE MÉDICALE · Fajma</div><div class="b"><div class="n">${esc(name)}</div>` +
        flags
          .slice(0, 3)
          .map((f) => `<div class="f">${esc(FLAG_LABELS[f]?.fr ?? f)}</div>`)
          .join("") +
        `<div class="s" style="margin-top:2mm">SAMU 1515 · Pompiers 18</div><div style="width:50mm">Scannez le code : ma fiche d'urgence</div></div><img class="q" src="${qr}">`,
    );
    card(
      `<div class="h">Personnes à prévenir</div><div class="b">` +
        (contacts.length
          ? contacts
              .map(
                (c) =>
                  `<div><b>${esc(c.name)}</b>${c.relation ? ` (${esc(c.relation)})` : ""} : ${esc(c.phone ?? "")}</div>`,
              )
              .join("")
          : "<div>—</div>") +
        `<div style="margin-top:3mm;color:#555">Informations complètes : scanner le QR code au recto.</div></div>`,
    );
    w.focus();
    w.print();
  };

  return (
    <div className="mt-3 rounded-xl border border-sunu-line bg-sunu-card p-5">
      <label className="flex items-center justify-between gap-3 rounded-lg bg-sunu-surface px-3 py-2.5 text-sm font-semibold text-sunu-dark">
        Activer la fiche d'urgence de {name}
        <input
          type="checkbox"
          checked={data.enabled}
          disabled={update.isPending}
          onChange={(e) => update.mutate({ enabled: e.target.checked })}
          className="size-5 accent-sunu-green"
        />
      </label>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div className="space-y-4">
          {data.stale && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
              Cette fiche n'a pas été mise à jour depuis plus d'un an : vérifiez traitements et
              personnes à prévenir, puis enregistrez.
            </p>
          )}
          {data.missing.length > 0 && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <b>À compléter</b> (les secours liraient « Non renseigné ») :{" "}
              {data.missing.map((m) => FIELD_LABEL[m] ?? m).join(", ")}.
            </p>
          )}
          {data.suggested_treatments.length > 0 && (
            <div className="rounded-lg bg-sunu-green-soft px-3 py-2 text-xs text-sunu-dark">
              <p>
                <b>Médicaments de vos ordonnances en cours</b>, absents de « Traitements en cours »
                : {data.suggested_treatments.join(" ; ")}
              </p>
              <button
                type="button"
                onClick={() => {
                  const current = (val("treatments") ?? "").trim();
                  const next = [current, ...data.suggested_treatments].filter(Boolean).join("\n");
                  update.mutate({ treatments: next });
                }}
                className="mt-1.5 rounded-lg bg-sunu-green px-3 py-1.5 font-semibold text-white"
              >
                Les ajouter à ma fiche
              </button>
            </div>
          )}
          {
            <fieldset className="grid gap-2">
              <legend className="text-xs font-semibold text-sunu-ink/60">Santé de {name}</legend>
              <select
                value={val("blood_group") ?? ""}
                onChange={(e) => setDraft({ ...draft, blood_group: e.target.value })}
                aria-label="Groupe sanguin"
                className={field}
              >
                {BLOOD.map((b) => (
                  <option key={b} value={b}>
                    {b ? `Groupe ${b}` : "Groupe sanguin inconnu"}
                  </option>
                ))}
              </select>
              {(["allergies", "treatments", "conditions"] as const).map((k) => (
                <textarea
                  key={k}
                  rows={2}
                  value={val(k) ?? ""}
                  onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
                  placeholder={
                    k === "allergies"
                      ? "Allergies"
                      : k === "treatments"
                        ? "Traitements en cours"
                        : "Antécédents, maladies"
                  }
                  aria-label={k}
                  className={field}
                />
              ))}
            </fieldset>
          }

          <fieldset>
            <legend className="text-xs font-semibold text-sunu-ink/60">Alertes vitales</legend>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {data.flag_choices.map((f) => {
                const on = flags.includes(f);
                return (
                  <button
                    key={f}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      setDraft({
                        ...draft,
                        critical_flags: on ? flags.filter((x) => x !== f) : [...flags, f],
                      })
                    }
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${on ? "bg-red-600 text-white" : "bg-sunu-surface text-sunu-ink/70 ring-1 ring-sunu-line"}`}
                  >
                    {FLAG_LABELS[f]?.fr ?? f}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-xs font-semibold text-sunu-ink/60">
              Personnes à prévenir (3 au plus)
              {data.relative ? " — vous êtes toujours prévenu en premier" : ""}
            </legend>
            <div className="mt-2 grid gap-2">
              {contacts.map((c, i) => (
                <div key={i} className="grid grid-cols-[1fr_0.7fr_1.2fr_auto] gap-1">
                  {(["name", "relation", "phone"] as const).map((k) => (
                    <input
                      key={k}
                      value={c[k] ?? ""}
                      onChange={(e) =>
                        setContacts(
                          contacts.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)),
                        )
                      }
                      placeholder={
                        k === "name" ? "Nom" : k === "relation" ? "Lien (fils…)" : "Téléphone"
                      }
                      aria-label={k}
                      className="w-full min-w-0 rounded-lg border border-sunu-line bg-sunu-card px-2 py-2 text-xs"
                    />
                  ))}
                  <button
                    type="button"
                    onClick={() => setContacts(contacts.filter((_, j) => j !== i))}
                    aria-label="Retirer"
                    className="text-sunu-ink/40 hover:text-red-600"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
              {contacts.length < 3 && (
                <button
                  type="button"
                  onClick={() => setContacts([...contacts, { name: "", relation: "", phone: "" }])}
                  className="flex w-fit items-center gap-1 text-xs font-semibold text-sunu-green"
                >
                  <Plus className="size-3.5" /> Ajouter une personne
                </button>
              )}
            </div>
          </fieldset>

          <input
            value={val("medical_devices") ?? ""}
            onChange={(e) => setDraft({ ...draft, medical_devices: e.target.value })}
            placeholder="Appareils médicaux (pacemaker, prothèse, pompe à insuline…)"
            aria-label="Appareils médicaux"
            className={field}
          />
          <input
            value={val("rescuer_notes") ?? ""}
            onChange={(e) => setDraft({ ...draft, rescuer_notes: e.target.value })}
            placeholder="Note pour les secours (parle seulement wolof, malentendant…)"
            aria-label="Note pour les secours"
            className={field}
          />
          <button
            disabled={!dirty || update.isPending}
            onClick={() => update.mutate(draft as EmergencyUpdate)}
            className="rounded-lg bg-sunu-green px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            Enregistrer la fiche
          </button>
        </div>

        <div className="space-y-4">
          <fieldset>
            <legend className="text-xs font-semibold text-sunu-ink/60">
              Ce que voient les secours (en plus du nom et de l'âge)
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
          </fieldset>
          {data.enabled && (
            <div className="flex flex-wrap items-start gap-4">
              <div className="flex flex-col items-center rounded-xl border border-sunu-line bg-white p-3">
                {qr ? (
                  <img
                    src={qr}
                    alt={`QR code de la fiche d'urgence de ${name}`}
                    className="size-36"
                  />
                ) : (
                  <Loader2 className="size-6 animate-spin text-sunu-ink/40" />
                )}
                <span className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-[#4b5563]">
                  <QrCode className="size-3.5" /> {name}
                </span>
              </div>
              <div className="grid gap-2">
                <button
                  onClick={downloadImage}
                  disabled={!qr}
                  className="flex items-center gap-1.5 rounded-lg bg-sunu-green px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                >
                  <Download className="size-3.5" /> Image pour le fond d'écran
                </button>
                <button
                  onClick={printWalletCard}
                  disabled={!qr}
                  className="flex items-center gap-1.5 rounded-lg border border-sunu-line px-3 py-2 text-xs font-semibold text-sunu-ink/70 hover:border-sunu-green hover:text-sunu-green disabled:opacity-50"
                >
                  <CreditCard className="size-3.5" /> Carte de portefeuille à imprimer
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
            </div>
          )}
          <p className="text-[11px] text-sunu-ink/50">
            Chaque consultation de la fiche est enregistrée et vous êtes prévenu par SMS. Téléphone
            ou carte perdus : créez un nouveau lien.
          </p>
        </div>
      </div>
    </div>
  );
}
