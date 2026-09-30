/** Lit un fichier choisi par l'utilisateur et l'encode en base64 pour l'API (par blocs, sans saturer la pile). */
export async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/** Formats acceptés par le serveur (le type réel est contrôlé côté serveur). */
export const ACCEPTED_FILES = "application/pdf,image/jpeg,image/png,image/webp";
