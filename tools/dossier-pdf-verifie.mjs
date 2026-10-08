// Relit le PDF produit par « tools/dossier-pdf.mjs » et vérifie que chaque chapitre commence bien à la page
// annoncée par le sommaire. Les numéros sont extraits du PDF lui-même : si une modification du texte décale
// un chapitre, ce contrôle le dit au lieu de laisser un sommaire faux partir chez un acquéreur.
//
//     npm i --no-save pdfjs-dist
//     node tools/dossier-pdf-verifie.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "docs", "dossier-technique");
const readme = fs.readFileSync(path.join(DIR, "README.md"), "utf8");
const [, VERSION] = readme.match(/\*\*Version du dossier :\*\* ([\d.]+)/);
const PDF = path.join(DIR, `Fajma-dossier-technique-v${VERSION}.pdf`);

const sansAccent = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");

const doc = await getDocument({ data: new Uint8Array(fs.readFileSync(PDF)) }).promise;
const pages = [];
for (let n = 1; n <= doc.numPages; n++) {
  const c = await (await doc.getPage(n)).getTextContent();
  pages.push(sansAccent(c.items.map((i) => i.str).join(" ")));
}

// Le sommaire (page 2) donne les couples « titre → page » : on les relit tels qu'imprimés.
const annonces = [...pages[1].matchAll(/(\d+\. [A-Za-zÀ-ÿ'’ ]+?) [A-Za-zÀ-ÿ].*? (\d+)(?= |$)/g)];
let ko = 0;
for (const [, titre, page] of annonces) {
  const t = sansAccent(titre.trim());
  // On cherche à partir de la page 3 : couverture et sommaire contiennent déjà tous les titres.
  const reel = pages.findIndex((p, i) => i >= 2 && p.includes(t)) + 1;
  const ok = reel === Number(page);
  if (!ok) ko++;
  console.log(`${ok ? "OK  " : "FAUX"} ${t} : sommaire p.${page}, réellement p.${reel || "introuvable"}`);
}
if (!annonces.length) {
  console.error("Aucune ligne de sommaire reconnue : le contrôle n'a rien vérifié.");
  process.exitCode = 1;
}
console.log(`${doc.numPages} pages ; ${ko} écart(s)`);
if (ko) process.exitCode = 1;
