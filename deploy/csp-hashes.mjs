// Calcule l'empreinte SHA-256 des scripts intégrés de la page générée, pour une politique CSP stricte
// (aucun 'unsafe-inline'), et l'origine du serveur Jitsi (VITE_JITSI_DOMAIN). Usage : node csp-hashes.mjs dist/client/_shell.html > csp.conf
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

// Le navigateur hache le script tel que l'analyseur HTML l'a lu : caractère nul remplacé par U+FFFD,
// fins de ligne CR/CRLF ramenées à LF. Le script de démarrage de TanStack contient des caractères nuls
// ("__root__\0") : sans cette normalisation, son empreinte ne correspond pas et toutes les pages restent blanches.
const asParsed = (body) => body.replace(/\0/g, "�").replace(/\r\n?/g, "\n");

const html = readFileSync(process.argv[2], "utf8");
const hashes = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
  .map((m) => m[1])
  .filter((body) => body.length > 0)
  .map((body) => `'sha256-${createHash("sha256").update(asParsed(body)).digest("base64")}'`);
process.stdout.write(`set $csp_script_hashes "${[...new Set(hashes)].join(" ")}";\n`);
process.stdout.write(`set $jitsi_origin "https://${process.env.VITE_JITSI_DOMAIN || "meet.jit.si"}";
`);
