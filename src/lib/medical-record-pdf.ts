/**
 * Dossier médical complet en PDF (généré dans le navigateur) : identité, profil de santé, comptes-rendus,
 * ordonnances, certificats, analyses, mesures, vaccins, documents. Sauts de page automatiques, en-tête Fajma.
 */
import { PDFDocument, StandardFonts, type PDFPage } from "pdf-lib";
import type { MedicalRecordExport } from "@/api/followup";
import { formatDate, formatDateTime } from "@/lib/datetime";
import {
  GREEN,
  INK,
  LINE,
  M,
  MUTED,
  PAGE,
  WASH,
  WIDTH,
  drawBrandBand,
  drawFooter,
  spacedTitle,
  type Fonts,
} from "@/lib/pdf-common";
import { clean } from "@/lib/prescription-text";

// Caractères affichables par les polices standard du PDF (WinAnsi) ; le reste (émojis…) est remplacé.
const WIN_ANSI_EXTRA = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";
const safe = (s: string) =>
  [...clean(s)]
    .map((c) => (c === "\n" || (c >= " " && c <= "ÿ") || WIN_ANSI_EXTRA.includes(c) ? c : "?"))
    .join("");

const day = (iso: string | null | undefined) =>
  iso ? formatDate(iso, { day: "numeric", month: "long", year: "numeric" }) : "";
const LEVELS: Record<string, string> = {
  very_high: "très élevée",
  high: "élevée",
  low: "basse",
};

export async function buildMedicalRecordPdf(d: MedicalRecordExport): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Dossier médical — ${d.patient.full_name}`);
  pdf.setCreator("Fajma");
  const f: Fonts = {
    font: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    italic: await pdf.embedFont(StandardFonts.HelveticaOblique),
  };
  const BOTTOM = 90; // au-dessus du bas de page
  let page!: PDFPage;
  let y = 0;

  let pageCount = 0;
  const newPage = () => {
    page = pdf.addPage(PAGE);
    pageCount += 1;
    // En-tête : nom du patient sur chaque page (les feuilles peuvent être séparées), logo à droite.
    const lines =
      pageCount === 1
        ? [
            { text: safe(d.patient.full_name), size: 15, bold: true },
            { text: "Dossier personnel et confidentiel", size: 9, soft: true },
          ]
        : [
            {
              text: safe(`Dossier médical de ${d.patient.full_name} (suite)`),
              size: 10,
              bold: true,
            },
          ];
    y = drawBrandBand(page, f, lines, [], { logo: "right" }) - 28;
  };
  const ensure = (h: number) => {
    if (y - h < BOTTOM) newPage();
  };
  const lines = (text: string, size: number, maxWidth: number, font = f.font) => {
    const out: string[] = [];
    for (const raw of safe(text).split("\n")) {
      let cur = "";
      for (const word of raw.split(/\s+/)) {
        const next = cur ? `${cur} ${word}` : word;
        if (font.widthOfTextAtSize(next, size) > maxWidth && cur) {
          out.push(cur);
          cur = word;
        } else cur = next;
      }
      out.push(cur);
    }
    return out;
  };
  const para = (
    text: string,
    opts: { size?: number; font?: typeof f.font; color?: typeof INK; indent?: number } = {},
  ) => {
    const size = opts.size ?? 9.5;
    const indent = opts.indent ?? 0;
    for (const l of lines(text, size, WIDTH - indent, opts.font)) {
      ensure(size + 4);
      page.drawText(l, {
        x: M + indent,
        y,
        size,
        font: opts.font ?? f.font,
        color: opts.color ?? INK,
      });
      y -= size + 3.5;
    }
  };
  const field = (label: string, value: string | null | undefined, indent = 0) => {
    if (!value) return;
    const size = 9.5;
    const labelText = safe(`${label} : `);
    const lw = f.bold.widthOfTextAtSize(labelText, size);
    const first = lines(value, size, WIDTH - indent - lw);
    ensure(size + 4);
    page.drawText(labelText, { x: M + indent, y, size, font: f.bold, color: INK });
    page.drawText(first[0] ?? "", { x: M + indent + lw, y, size, font: f.font, color: INK });
    y -= size + 3.5;
    const rest = lines(first.slice(1).join(" "), size, WIDTH - indent);
    if (first.length > 1)
      for (const l of rest) {
        ensure(size + 4);
        page.drawText(l, { x: M + indent, y, size, font: f.font, color: INK });
        y -= size + 3.5;
      }
  };
  const section = (title: string, count?: number) => {
    ensure(70); // titre + au moins deux lignes ensemble : pas de titre seul en bas de page
    y -= 10;
    page.drawRectangle({ x: M, y: y - 5, width: WIDTH, height: 20, color: WASH });
    page.drawText(safe(count != null ? `${title} (${count})` : title), {
      x: M + 8,
      y,
      size: 11,
      font: f.bold,
      color: GREEN,
    });
    y -= 26;
  };
  const entryHead = (text: string) => {
    ensure(30);
    para(text, { font: f.bold, size: 10 });
  };
  const gap = (h = 8) => {
    y -= h;
  };
  const rule = () => {
    ensure(10);
    page.drawLine({
      start: { x: M, y: y + 4 },
      end: { x: M + WIDTH, y: y + 4 },
      thickness: 0.6,
      color: LINE,
    });
    y -= 6;
  };
  const empty = (text: string) => para(text, { color: MUTED, font: f.italic });
  const forWho = (who: string | null) => (who ? ` — pour ${who}` : "");

  // ── Page de garde (haut de la première page) ──
  newPage();
  spacedTitle(page, "DOSSIER MÉDICAL", M, y, 15, f.bold);
  y -= 24;
  para(
    `Document établi le ${formatDateTime(d.generated_at, { dateStyle: "long", timeStyle: "short" })} à la demande du titulaire.`,
    {
      color: MUTED,
      size: 9,
    },
  );
  para(
    "Document personnel et confidentiel : il contient des données de santé. Ne le transmettez qu'aux professionnels de santé de votre choix.",
    { color: MUTED, size: 9, font: f.italic },
  );
  gap(4);

  section("Identité");
  const p = d.patient;
  field("Nom", p.full_name);
  field("Date de naissance", p.birth_date ? day(p.birth_date) : null);
  field("Sexe", p.sex === "F" ? "Féminin" : p.sex === "M" ? "Masculin" : null);
  field("Téléphone", p.phone);
  field("Email", p.email);
  field("Ville", p.city);
  if (d.relatives.length) {
    gap(4);
    para("Proches suivis sur ce compte :", { font: f.bold });
    for (const r of d.relatives)
      para(
        `- ${r.full_name} (${r.relationship}${r.birth_date ? `, né(e) le ${day(r.birth_date)}` : ""})`,
        { indent: 8 },
      );
  }

  section("Profil de santé");
  const hp = d.health_profile;
  if (!hp || !Object.values(hp).some(Boolean)) empty("Profil de santé non renseigné.");
  else {
    field("Groupe sanguin", hp.blood_group);
    field("Allergies", hp.allergies);
    field("Antécédents et maladies", hp.conditions);
    field("Traitements en cours", hp.treatments);
    field("Vaccinations (déclarées)", hp.vaccinations);
    field("Personne à prévenir", hp.emergency_contact);
  }

  section("Comptes-rendus de consultation", d.records.length);
  if (!d.records.length) empty("Aucun compte-rendu.");
  d.records.forEach((r, i) => {
    if (i) rule();
    entryHead(
      `${day(r.date)} — ${r.doctor}${r.specialty ? ` (${r.specialty})` : ""}${forWho(r.for)}`,
    );
    field("Résumé", r.summary, 8);
    field("Conclusion", r.diagnosis, 8);
    field("Traitement", r.treatment, 8);
    gap(2);
  });

  section("Ordonnances", d.prescriptions.length);
  if (!d.prescriptions.length) empty("Aucune ordonnance.");
  d.prescriptions.forEach((o, i) => {
    if (i) rule();
    entryHead(`${day(o.date)} — ${o.doctor}${forWho(o.for)}`);
    para(o.content, { indent: 8 });
    field("Conseils", o.instructions, 8);
    para(`Réf. ${o.reference}${o.valid_until ? ` · valable jusqu'au ${day(o.valid_until)}` : ""}`, {
      indent: 8,
      size: 8.5,
      color: MUTED,
    });
    gap(2);
  });

  section("Certificats et arrêts de travail", d.issued_documents.length);
  if (!d.issued_documents.length) empty("Aucun certificat.");
  for (const c of d.issued_documents) {
    const period =
      c.start_date && c.end_date ? ` du ${day(c.start_date)} au ${day(c.end_date)}` : "";
    para(
      `- ${day(c.date)} — ${c.kind}${period} — ${c.doctor}${forWho(c.for)} (réf. ${c.reference})`,
    );
  }

  section("Analyses de laboratoire", d.lab_orders.length);
  if (!d.lab_orders.length) empty("Aucune analyse prescrite.");
  d.lab_orders.forEach((l, i) => {
    if (i) rule();
    entryHead(`${day(l.date)} — prescrites par ${l.doctor}${forWho(l.for)}`);
    field("Analyses", l.tests, 8);
    field(
      "Statut",
      `${l.status}${l.laboratory ? ` · ${l.laboratory}` : ""}${l.completed_at ? ` · résultats du ${day(l.completed_at)}` : ""}`,
      8,
    );
    field("Commentaire du laboratoire", l.result_note, 8);
  });

  section("Mesures à domicile (6 derniers mois)", d.measurements.length);
  if (!d.measurements.length) empty("Aucune mesure.");
  for (const m of d.measurements) {
    const value =
      m.systolic != null
        ? `${m.systolic}/${m.diastolic} mmHg${m.pulse ? ` · pouls ${m.pulse}` : ""}`
        : `${m.value?.toLocaleString("fr-FR")} ${m.kind === "Poids" ? "kg" : "g/L"}${m.context === "fasting" ? " · à jeun" : m.context === "after_meal" ? " · après repas" : ""}`;
    const level = LEVELS[m.level] ? ` — ${LEVELS[m.level]}` : "";
    para(
      `- ${formatDateTime(m.date, { dateStyle: "short", timeStyle: "short" })} · ${m.kind} : ${value}${level}${forWho(m.for)}`,
    );
  }

  section("Vaccins", d.vaccines.length);
  if (!d.vaccines.length) empty("Aucun vaccin enregistré.");
  for (const v of d.vaccines)
    para(
      `- ${day(v.date)} — ${v.vaccine}${forWho(v.for)}${v.verified ? " (inscrit par un médecin)" : ""}`,
    );

  section("Documents déposés", d.documents.length);
  if (!d.documents.length) empty("Aucun document.");
  else
    para(
      "Liste des documents ; les fichiers se téléchargent un par un depuis votre dossier sur Fajma.",
      {
        color: MUTED,
        size: 8.5,
        font: f.italic,
      },
    );
  for (const doc of d.documents) para(`- ${day(doc.date)} — ${doc.title} (${doc.category})`);

  // Pied de page numéroté sur chaque page (bande tricolore, mention, fajma.sn · Page x/y).
  const pages = pdf.getPages();
  pages.forEach((pg, i) =>
    drawFooter(
      pg,
      f,
      safe(
        `Dossier médical de ${d.patient.full_name} : personnel et confidentiel, édité via Fajma.`,
      ),
      `${i + 1}/${pages.length}`,
    ),
  );
  return pdf.save();
}
