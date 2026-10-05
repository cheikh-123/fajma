/**
 * Téléchargement d'un PDF fabriqué dans le navigateur. Module séparé et léger : les pages l'importent
 * directement, la bibliothèque PDF (lourde) n'est chargée qu'au moment du clic, par import dynamique.
 */
export function downloadPdf(bytes: Uint8Array, fileName: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
