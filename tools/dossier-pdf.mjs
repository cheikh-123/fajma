// Assemble le dossier technique (Markdown) en un PDF prêt à transmettre : couverture, sommaire avec les
// numéros de page, puis les chapitres dans l'ordre.
//
// Les numéros du sommaire sont MESURÉS, pas estimés : chaque chapitre commençant sur une page neuve, on le
// rend d'abord seul pour compter ses pages, puis on assemble le document définitif. Le script s'arrête en
// erreur si le nombre de pages annoncé ne correspond pas au PDF produit.
//
// Usage, depuis la racine du dépôt :
//     npm i --no-save puppeteer marked        (pdf-lib est déjà une dépendance du projet)
//     node tools/dossier-pdf.mjs
//     node tools/dossier-pdf-verifie.mjs      (relit le PDF et contrôle les numéros du sommaire)
//
// Le nom du fichier et la version affichée suivent le « Version du dossier » du README : un seul endroit à
// changer pour publier une nouvelle version.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { marked } from "marked";
import puppeteer from "puppeteer";
import { PDFDocument } from "pdf-lib";

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "docs", "dossier-technique");
const files = ["README.md", "01-architecture.md", "02-securite.md", "03-donnees-et-conformite.md", "04-exploitation.md", "05-risques-et-plan-action.md", "06-cession.md", "07-licences.md", "08-guide-fonctionnel.md", "09-audit-global.md", "10-incidents.md"];

const readme = fs.readFileSync(path.join(DIR, "README.md"), "utf8");
const [, VERSION, DATE] = readme.match(/\*\*Version du dossier :\*\* ([\d.]+) — ([^\r\n]+)/);
const OUT = path.join(DIR, `Fajma-dossier-technique-v${VERSION}.pdf`);

// Logo Fajma (src/lib/fajma-mark.ts) : bulle verte, « f » en croix blanc, cœur doré.
const MARK = (size) => `<svg width="${size}" height="${size}" viewBox="0 0 32 32" style="flex:none"><path fill="#00853f" d="M8 0h16a8 8 0 0 1 8 8v12a8 8 0 0 1-8 8H12.5l-6 4.2c-.9.6-2 0-2-1.1V27.2A8 8 0 0 1 0 20V8a8 8 0 0 1 8-8z"/><g transform="translate(2.88 0.88) scale(0.82)"><path fill="#ffffff" d="M13.6 13.4V11.8c0-3.2 2.3-5.3 5.5-5.3h2.6a2.2 2.2 0 0 1 0 4.4h-2.4c-.9 0-1.3.4-1.3 1.3v1.2h4.6a2.2 2.2 0 0 1 0 4.4H18v7.4a2.2 2.2 0 0 1-4.4 0v-7.4H9a2.2 2.2 0 0 1 0-4.4z"/><path fill="#fdef42" d="M13.6 13.4h4.4v4.4h-4.4z"/></g></svg>`;
const STAR = (size) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" style="display:block"><path d="M12.00 1.10L14.70 8.88L22.94 9.05L16.37 14.02L18.76 21.90L12.00 17.20L5.24 21.90L7.63 14.02L1.06 9.05L9.30 8.88Z" fill="#00853f"/></svg>`;
// Fine bande vert, jaune, rouge avec l'étoile sur une pastille blanche au centre (comme sur les ordonnances).
const RULE = (h = 2.5) => `<div style="position:relative;display:flex;height:${h}px;-webkit-print-color-adjust:exact;print-color-adjust:exact"><span style="flex:1;background:#00853f"></span><span style="flex:1;background:#fdef42"></span><span style="flex:1;background:#e31b23"></span><span style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);background:#fff;border-radius:50%;padding:1.5px">${STAR(9)}</span></div>`;

const anchors = Object.fromEntries(files.map((f) => [f, `ch-${f.replace(".md", "")}`]));

// Chaque chapitre : son ancre, son titre (le premier « # » du fichier) et son HTML.
const chapters = files.map((f) => {
  let md = fs.readFileSync(path.join(DIR, f), "utf8");
  // Liens entre fichiers → liens internes au PDF.
  md = md.replace(/\]\((\d\d-[a-z-]+\.md|README\.md)(#[^)]*)?\)/g, (_, file) => `](#${anchors[file]})`);
  const title = (md.match(/^# (.+)$/m) || [, f])[1].trim();
  return { file: f, id: anchors[f], title, html: marked.parse(md) };
});
// Résumé de chaque chapitre : repris du tableau du README, pour n'avoir qu'un seul endroit à tenir à jour.
const blurbs = Object.fromEntries(
  [...readme.matchAll(/^\| *\d+ *\| *\[[^\]]+\]\((\d\d-[a-z-]+\.md)\) *\| *([^|]+?) *\|/gm)].map((m) => [m[1], m[2]]),
);
blurbs["README.md"] = "Présentation du produit, périmètre du dossier, état d'avancement et historique des versions.";

const section = (c) => `<section class="chapter" id="${c.id}">${c.html}</section>`;
const body = chapters.map(section).join("");

// Repères affichés en couverture. Chiffres vérifiables : nombre de tests réellement exécutés, versions du
// socle technique, et la conclusion de l'inventaire des licences (chapitre 7).
const FACTS = [
  ["429", "tests automatisés, SQLite et PostgreSQL"],
  ["Django 6.1", "PostgreSQL 17 · React 19"],
  ["0", "composant sous copyleft fort"],
  ["10", "chapitres + annexe des licences"],
  ["WCAG AA", "accessibilité vérifiée (axe-core)"],
  ["Portable", "aucune dépendance à un hébergeur"],
];


// La couverture : marque en haut, titre et repères au milieu, destinataires et confidentialité en bas.
const cover = (TOTAL_PAGES) => `<div class="cover">
  <div>
    <div style="display:flex;align-items:center;gap:16px">${MARK(70)}<h1 style="border:0;margin:0;padding:0;font-size:44pt;color:#00853f">Fajma</h1></div>
    <p style="margin:8px 0 0;color:#8a9790;font-size:11pt">Votre santé, simplement</p>
  </div>

  <div>
    <div style="width:100%;margin-bottom:24px">${RULE(4)}</div>
    <p class="kicker">Dossier technique et sécurité</p>
    <p class="doctitle">Plateforme de santé<br>numérique du Sénégal</p>
    <span class="edition">Version ${VERSION} — ${DATE}</span>
    <p class="pitch">Prise de rendez-vous, téléconsultation en français et en wolof, dossier médical, ordonnances,
    analyses et imagerie, paiement mobile, assurances et pharmacies. Ce dossier décrit l'architecture, la sécurité,
    l'exploitation et les conditions d'une reprise du projet.</p>
    <div class="facts">${FACTS.map((f) => `<div><b>${f[0]}</b><span>${f[1]}</span></div>`).join("")}</div>
  </div>

  <div>
    <p style="margin:0 0 4px;font-size:9pt;color:#66756d"><b style="color:#11261c">Destinataires :</b>
    acquéreurs, investisseurs, auditeurs techniques et juridiques, équipe technique reprenant le projet.</p>
    <div class="conf"><b>Document confidentiel.</b> Il décrit l'architecture et les mesures de sécurité de la
    plateforme. À transmettre uniquement sous accord de confidentialité.</div>
    <p class="issued">Établi le ${DATE} · fajma.sn · ${chapters.length - 1} chapitres, ${TOTAL_PAGES} pages</p>
  </div>
</div>`;

// Le sommaire. Les numéros de page viennent du premier passage ; la ligne entière est cliquable.
const toc = (rows) => `
<div class="toc">
  <h1>Sommaire</h1>
  <p style="color:#66756d;margin:6px 0 0">Chaque ligne renvoie au chapitre dans le PDF.</p>
  <ol>${rows}</ol>
</div>`;
const document_ = (inner) => `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>
  @page { size: A4; margin: 18mm 16mm 20mm; }
  :root { color-scheme: light; }
  html, body { background: #ffffff; }
  body { font-family: "Segoe UI", Arial, sans-serif; font-size: 10pt; line-height: 1.45; color: #1c2521; }
  /* ── Couverture : trois blocs qui occupent toute la hauteur (marque, titre, repères) ── */
  .cover { height: 232mm; display: flex; flex-direction: column; justify-content: space-between; page-break-after: always; }
  .cover h1 { font-size: 30pt; margin: 0; color: #00853f; }
  .cover p { margin: 3px 0; color: #444; }
  .cover .kicker { font-size: 8.5pt; letter-spacing: .18em; text-transform: uppercase; color: #8a9790; font-weight: 700; }
  .cover .doctitle { font-size: 27pt; line-height: 1.1; font-weight: 700; color: #11261c; margin: 10px 0 0; }
  .cover .edition { margin-top: 14px; display: inline-block; background: #e8f3ec; color: #155d3a; font-weight: 700;
                    font-size: 9.5pt; padding: 5px 12px; border-radius: 999px; }
  .cover .pitch { margin-top: 16px; font-size: 10.5pt; line-height: 1.55; color: #3b4a43; max-width: 150mm; }
  /* Repères : ce que l'acquéreur veut savoir avant d'ouvrir le document. */
  .facts { display: flex; flex-wrap: wrap; gap: 0; border-top: 1px solid #dce5e0; margin-top: 22px; }
  .facts div { flex: 1 1 33%; padding: 12px 14px 12px 0; border-bottom: 1px solid #f0f4f2; }
  .facts b { display: block; font-size: 15pt; color: #00853f; line-height: 1.1; }
  .facts span { display: block; font-size: 8pt; color: #66756d; margin-top: 3px; }
  .conf { margin-top: 26px; padding: 10px 14px; border-left: 4px solid #e31b23; background: #fdf2f2; font-size: 9pt; }
  .cover .issued { margin-top: 14px; font-size: 8pt; color: #8a9790; }

  /* ── Sommaire ── */
  .toc { page-break-after: always; }
  .toc ol { list-style: none; margin: 18px 0 0; padding: 0; counter-reset: ch; }
  .toc li { display: flex; align-items: baseline; gap: 8px; padding: 9px 0; border-bottom: 1px solid #eef2f0; }
  .toc .ti { font-weight: 600; color: #11261c; flex: 0 1 auto; min-width: 0; }
  .toc .de { color: #66756d; font-size: 8.6pt; display: block; margin-top: 2px; font-weight: 400; }
  .toc .dots { flex: 1; border-bottom: 1px dotted #c7d2cc; transform: translateY(-3px); }
  .toc .pg { flex: none; color: #155d3a; font-weight: 700; font-variant-numeric: tabular-nums; }
  .toc a { color: inherit; }
  .chapter { page-break-before: always; }
  .chapter:first-of-type { page-break-before: auto; }
  h1 { font-size: 18pt; color: #00853f; border-bottom: 2px solid #00853f; padding-bottom: 4px; margin-top: 0; }
  h2 { font-size: 13pt; color: #155d3a; margin-top: 20px; }
  h3 { font-size: 11pt; }
  table { border-collapse: collapse; width: 100%; margin: 8px 0 14px; font-size: 8.6pt; page-break-inside: auto; }
  tr { page-break-inside: avoid; }
  th, td { border: 1px solid #cfd8d3; padding: 4px 6px; vertical-align: top; text-align: left; }
  th { background: #e8f3ec; }
  code { font-family: Consolas, monospace; font-size: 8.6pt; background: #f1f4f2; padding: 0 3px; border-radius: 3px; }
  pre { background: #f1f4f2; padding: 8px; font-size: 7.4pt; line-height: 1.25; overflow: hidden; white-space: pre; }
  pre code { background: none; padding: 0; }
  blockquote { border-left: 3px solid #fdb913; margin: 8px 0; padding: 4px 12px; background: #fffbea; }
  a { color: #00853f; text-decoration: none; }
</style></head><body>${inner}</body></html>`;

const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }]);

// En-tête et bas de page, identiques à tous les passages : ils fixent la hauteur utile de chaque page, donc
// le découpage. Mesurer avec d'autres marges donnerait de faux numéros dans le sommaire.
const HEADER = `<div style="width:100%;padding:0 16mm;font-family:Arial,sans-serif;-webkit-print-color-adjust:exact">
    <div style="display:flex;justify-content:space-between;align-items:flex-end;padding-bottom:5px">
      <div><div style="display:flex;align-items:center;gap:5px">${MARK(17)}<b style="font-size:11pt;color:#00853f">Fajma</b></div>
        <div style="font-size:6.5pt;color:#667;margin-top:2px">Votre santé, simplement</div></div>
      <div style="text-align:right;line-height:1.35"><b style="font-size:8.5pt;color:#1c2521">Dossier technique et sécurité</b>
        <div style="font-size:7pt;color:#00853f;font-weight:bold">Version ${VERSION} — ${DATE}</div>
        <div style="font-size:6.5pt;color:#667">Document confidentiel</div></div>
    </div>${RULE()}</div>`;
const FOOTER = `<div style="width:100%;padding:0 16mm;font-family:Arial,sans-serif;text-align:center;-webkit-print-color-adjust:exact">${RULE()}
    <div style="font-size:6.5pt;color:#667;margin-top:5px">Document confidentiel : à transmettre uniquement sous accord de confidentialité.</div>
    <div style="font-size:7pt;color:#00853f;font-weight:bold;margin-top:2px">fajma.sn · Page <span class="pageNumber"></span>/<span class="totalPages"></span></div></div>`;
const PDF_OPTIONS = {
  format: "A4",
  printBackground: true,
  displayHeaderFooter: true,
  headerTemplate: HEADER,
  footerTemplate: FOOTER,
  margin: { top: "34mm", bottom: "22mm", left: "16mm", right: "16mm" },
};

/** Rend un contenu en PDF (sur disque si `out` est donné) et renvoie le fichier produit. */
const render = async (inner, out) => {
  await page.setContent(document_(inner), { waitUntil: "load" });
  return page.pdf(out ? { ...PDF_OPTIONS, path: out } : PDF_OPTIONS);
};
const pageCount = async (inner) => (await PDFDocument.load(await render(inner))).getPageCount();

/** Une ligne de sommaire. Le README (chapitre 0) n'a pas de numéro. */
const rows = (pages) =>
  chapters
    .map((c, i) => {
      const d = blurbs[c.file] ? `<span class="de">${blurbs[c.file]}</span>` : "";
      return `<li><span class="ti">${c.title}${d}</span>` +
        `<span class="dots"></span><a class="pg" href="#${c.id}">${pages[i]}</a></li>`;
    })
    .join("");

// ── Premier passage : mesurer ────────────────────────────────────────
// Chaque chapitre commence sur une page neuve (page-break-before) : le rendre seul donne donc exactement le
// nombre de pages qu'il occupera dans le document complet. On compte plutôt que d'estimer à partir des
// hauteurs, qui se trompe dès qu'un tableau refuse d'être coupé en deux.
const counts = [];
for (const c of chapters) counts.push(await pageCount(section(c)));
// Les pages d'ouverture : la longueur du sommaire ne dépend pas de la valeur des numéros, seulement de leur
// présence, d'où les numéros provisoires.
const front = await pageCount(cover("—") + toc(rows(counts.map(() => 99))));

const starts = [];
let at = front + 1;
for (const n of counts) {
  starts.push(at);
  at += n;
}
const TOTAL_PAGES = at - 1;

// ── Second passage : le document définitif, avec les vrais numéros ───
await render(cover(TOTAL_PAGES) + toc(rows(starts)) + body, OUT);
const produced = (await PDFDocument.load(fs.readFileSync(OUT))).getPageCount();
if (produced !== TOTAL_PAGES) {
  console.error(`ATTENTION : sommaire calculé pour ${TOTAL_PAGES} pages, PDF produit ${produced}.`);
  process.exitCode = 1;
}

await browser.close();
console.log("PDF :", OUT, fs.statSync(OUT).size, "octets,", produced, "pages");
