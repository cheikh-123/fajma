/** Authentification par session Django (cookie HttpOnly). */
import { useQuery } from "@tanstack/react-query";
import { api } from "./client";
import type { User } from "./types";

export const getMe = () => api.get<{ user: User | null }>("/auth/me").then((r) => r.user);

export const register = (data: { email: string; password: string; full_name: string }) =>
  api.post<{ user: User }>("/auth/register", data).then((r) => r.user);

/** Renvoie l'utilisateur, ou null si un code de double authentification est demandé. */
export const login = (data: { email: string; password: string }) =>
  api
    .post<{ user?: User; mfa_required?: boolean }>("/auth/login", data)
    .then((r) => (r.mfa_required ? null : (r.user ?? null)));

export const loginMfa = (code: string) =>
  api.post<{ user: User }>("/auth/login/mfa", { code }).then((r) => r.user);

export const getMfaStatus = () =>
  api.get<{ enabled: boolean; recovery_codes_left: number }>("/auth/mfa");
export const startMfa = () =>
  api.post<{ secret: string; otpauth_uri: string }>("/auth/mfa", { action: "start" });
export const confirmMfa = (code: string) =>
  api.post<{ enabled: true; recovery_codes: string[] }>("/auth/mfa", { action: "confirm", code });
export const disableMfa = (password: string) =>
  api.post<{ enabled: false }>("/auth/mfa", { action: "disable", password });

/** Accès démo sans identification (serveur de développement uniquement). */
export type DemoAccount =
  "patient" | "medecin" | "pharmacie" | "clinique" | "secretariat" | "laboratoire" | "admin";
export const getDemoLogin = () => api.get<{ enabled: boolean }>("/auth/demo-login");
export const demoLogin = (account: DemoAccount) =>
  api.post<{ user: User }>("/auth/demo-login", { account }).then((r) => r.user);

export const logout = async () => {
  // Efface les données personnelles gardées pour la consultation hors ligne (téléphone partagé).
  navigator.serviceWorker?.controller?.postMessage({ type: "logout" });
  return api.post<{ ok: true }>("/auth/logout");
};

/** current_password inutile pour un compte ouvert par SMS (il définit son premier mot de passe). */
export const changePassword = (data: { current_password?: string; new_password: string }) =>
  api.post<{ ok: true }>("/auth/password-change", data);

/** Ferme immédiatement toutes les sessions du compte sauf celle de cet appareil (téléphone perdu…). */
export const logoutOtherDevices = () =>
  api.post<{ ok: true; closed: number }>("/auth/sessions/logout-others");

export const requestPasswordReset = (email: string) =>
  api.post<{ ok: true }>("/auth/password-reset", { email });

export const confirmPasswordReset = (data: { uid: string; token: string; password: string }) =>
  api.post<{ ok: true }>("/auth/password-reset/confirm", data);

export const meQueryKey = ["me"] as const;

/** Utilisateur connecté (null si déconnecté), partagé par toute l'application. */
export function useMe() {
  return useQuery({ queryKey: meQueryKey, queryFn: getMe, staleTime: 60_000 });
}

/** Téléchargement de toutes ses données (droit d'accès). */
export const exportMyDataUrl = "/api/auth/export";

export const deleteMyAccount = (password: string) =>
  api.post<{ ok: true }>("/auth/delete-account", { password });

/** Connexion par téléphone : envoi d'un code SMS (dev_code n'existe qu'en local, sans Twilio). */
export const requestOtp = (phone: string) =>
  api.post<{ sent: true; phone: string; dev_code?: string }>("/auth/otp/request", { phone });

export type OtpResult = { user?: User; needs_name?: boolean; mfa_required?: boolean };

export const verifyOtp = (data: { phone: string; code?: string; full_name?: string }) =>
  api.post<OtpResult>("/auth/otp/verify", data);

export const getMyAccessLog = () =>
  api.get<{ id: string; action: string; who: string; at: string }[]>("/patient/access-log");

export const getAdminAudit = () =>
  api.get<
    {
      id: string;
      action: string;
      who: string;
      patient: string | null;
      target: string;
      ip: string | null;
      at: string;
    }[]
  >("/admin/audit");
