/**
 * Clés d'accès (passkeys) côté navigateur : empreinte, visage, code de l'appareil ou clé USB.
 *
 * Le navigateur parle en objets binaires, le serveur en texte : ce module fait la traduction dans les deux
 * sens (base64 « url-safe », sans caractère de remplissage). Rien d'autre.
 *
 * La clé privée ne quitte jamais l'appareil, et le navigateur refuse de la présenter à un autre domaine que
 * celui qui l'a créée — c'est ce qui rend l'hameçonnage inopérant.
 */
import { api } from "@/api/client";

/** Vrai si l'appareil sait créer et utiliser une clé d'accès. */
export function passkeysSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.PublicKeyCredential === "function" &&
    typeof navigator.credentials?.create === "function"
  );
}

const toBytes = (value: string): Uint8Array => {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
};

const toText = (buffer: ArrayBuffer): string => {
  let binary = "";
  for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

/** Les options renvoyées par le serveur, dont les champs binaires sont encodés en texte. */
type ServerOptions = Record<string, unknown> & {
  challenge: string;
  user?: { id: string; name: string; displayName: string };
  excludeCredentials?: { id: string; type: string; transports?: string[] }[];
  allowCredentials?: { id: string; type: string; transports?: string[] }[];
};

// Le serveur renvoie exactement la structure attendue par le navigateur, à ceci près que les champs
// binaires sont encodés en texte : d'où le passage par `unknown` plutôt qu'un type réécrit à la main.
const decodeOptions = (options: ServerOptions) => ({
  ...options,
  challenge: toBytes(options.challenge),
  ...(options.user ? { user: { ...options.user, id: toBytes(options.user.id) } } : {}),
  ...(options.excludeCredentials
    ? { excludeCredentials: options.excludeCredentials.map((c) => ({ ...c, id: toBytes(c.id) })) }
    : {}),
  ...(options.allowCredentials
    ? { allowCredentials: options.allowCredentials.map((c) => ({ ...c, id: toBytes(c.id) })) }
    : {}),
});

const encodeCredential = (credential: PublicKeyCredential) => {
  const response = credential.response as AuthenticatorAttestationResponse &
    AuthenticatorAssertionResponse;
  return {
    id: credential.id,
    rawId: toText(credential.rawId),
    type: credential.type,
    clientExtensionResults: credential.getClientExtensionResults(),
    response: {
      clientDataJSON: toText(response.clientDataJSON),
      ...(response.attestationObject
        ? { attestationObject: toText(response.attestationObject) }
        : {
            authenticatorData: toText(response.authenticatorData),
            signature: toText(response.signature),
            userHandle: response.userHandle ? toText(response.userHandle) : null,
          }),
    },
  };
};

export type Passkey = {
  id: string;
  label: string;
  created_at: string;
  last_used_at: string | null;
};

export const listPasskeys = () => api.get<{ passkeys: Passkey[] }>("/auth/passkeys");

/** Crée une clé sur cet appareil et l'enregistre sur le compte connecté. */
export async function addPasskey(label: string): Promise<Passkey> {
  const options = await api.post<ServerOptions>("/auth/passkeys", { action: "start" });
  const credential = (await navigator.credentials.create({
    publicKey: decodeOptions(options) as unknown as PublicKeyCredentialCreationOptions,
  })) as PublicKeyCredential | null;
  if (!credential) throw new Error("Création annulée");
  const { passkey } = await api.post<{ passkey: Passkey }>("/auth/passkeys", {
    action: "confirm",
    credential: encodeCredential(credential),
    label,
  });
  return passkey;
}

export const removePasskey = (id: string) =>
  api.post<{ ok: true }>("/auth/passkeys", { action: "remove", id });

/** Deuxième étape de connexion : à appeler après que le mot de passe a été accepté. */
export async function loginWithPasskey() {
  const options = await api.post<ServerOptions>("/auth/login/passkey", { action: "start" });
  const credential = (await navigator.credentials.get({
    publicKey: decodeOptions(options) as unknown as PublicKeyCredentialRequestOptions,
  })) as PublicKeyCredential | null;
  if (!credential) throw new Error("Connexion annulée");
  return api.post<{ user: unknown }>("/auth/login/passkey", {
    action: "verify",
    credential: encodeCredential(credential),
  });
}
