import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import QRCode from "qrcode";
import { KeyRound, Lock, MonitorSmartphone, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import {
  changePassword,
  confirmMfa,
  disableMfa,
  getMfaStatus,
  logoutOtherDevices,
  meQueryKey,
  startMfa,
  useMe,
} from "@/api/auth";

/** Sécurité du compte : double authentification (QR code, codes de secours) et mot de passe. */
export function SecuritySection() {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const pro = Boolean(me?.is_professional);
  const { data: status } = useQuery({ queryKey: ["mfa"], queryFn: getMfaStatus });
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState<string[] | null>(null);
  const [password, setPassword] = useState("");
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["mfa"] });
    qc.invalidateQueries({ queryKey: meQueryKey });
  };

  const start = useMutation({
    mutationFn: startMfa,
    onSuccess: async (res) =>
      setSetup({
        secret: res.secret,
        qr: await QRCode.toDataURL(res.otpauth_uri, { width: 200, margin: 1 }),
      }),
    onError: (e) => toast.error(e.message),
  });
  const confirm = useMutation({
    mutationFn: () => confirmMfa(code),
    onSuccess: (res) => {
      setRecovery(res.recovery_codes);
      setSetup(null);
      setCode("");
      refresh();
      toast.success("Double authentification activée");
    },
    onError: (e) => toast.error(e.message),
  });
  const disable = useMutation({
    mutationFn: () => disableMfa(password),
    onSuccess: () => {
      setPassword("");
      refresh();
      toast.success("Double authentification désactivée");
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-sunu-dark">
        <ShieldCheck className="size-5 text-sunu-green" /> Sécurité du compte
      </h2>
      <div className="grid gap-4 rounded-xl border border-sunu-line bg-sunu-card p-5 text-sm">
        {recovery && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
            <p className="font-semibold text-amber-900">
              Codes de secours : notez-les maintenant, ils ne seront plus affichés.
            </p>
            <p className="mt-1 text-xs text-amber-900/80">
              Chaque code permet une connexion si vous perdez votre téléphone.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2 font-mono text-sm sm:grid-cols-4">
              {recovery.map((c) => (
                <span key={c} className="rounded bg-sunu-card px-2 py-1 text-center">
                  {c}
                </span>
              ))}
            </div>
            <button
              onClick={() => setRecovery(null)}
              className="mt-3 text-xs font-semibold text-amber-900 underline"
            >
              J'ai noté mes codes
            </button>
          </div>
        )}

        {status?.enabled ? (
          <>
            <p className="flex items-center gap-2 font-semibold text-sunu-teal">
              <ShieldCheck className="size-4" /> Double authentification activée
            </p>
            <p className="text-xs text-sunu-ink/60">
              Codes de secours restants : {status.recovery_codes_left}
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                disable.mutate();
              }}
              className="flex flex-wrap gap-2"
            >
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mot de passe"
                autoComplete="current-password"
                className="min-w-0 flex-1 rounded-lg border border-sunu-line px-3 py-2"
              />
              <button
                disabled={disable.isPending}
                className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600"
              >
                {pro ? "Changer de téléphone" : "Désactiver"}
              </button>
            </form>
            {pro && (
              <p className="text-[11px] text-sunu-ink/50">
                Nouveau téléphone : désactivez avec votre mot de passe, puis scannez le nouveau code
                QR (la double authentification reste obligatoire pour votre compte).
              </p>
            )}
          </>
        ) : setup ? (
          <div className="grid gap-3 sm:grid-cols-[200px_1fr]">
            <img
              src={setup.qr}
              alt="QR code à scanner avec votre application d'authentification"
              className="rounded-lg border border-sunu-line"
            />
            <div className="grid content-start gap-2">
              <p>1. Scannez ce code avec Google Authenticator, Microsoft Authenticator ou Authy.</p>
              <p className="text-xs text-sunu-ink/60">
                Ou saisissez la clé :{" "}
                <code className="break-all rounded bg-sunu-surface px-1">{setup.secret}</code>
              </p>
              <p>2. Entrez le code à 6 chiffres affiché :</p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  confirm.mutate();
                }}
                className="flex gap-2"
              >
                <input
                  required
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="123456"
                  aria-label="Code à 6 chiffres"
                  className="w-32 rounded-lg border border-sunu-line px-3 py-2 text-center tracking-widest"
                />
                <button
                  disabled={confirm.isPending}
                  className="rounded-lg bg-sunu-green px-4 py-2 text-xs font-semibold text-white"
                >
                  Activer
                </button>
              </form>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sunu-ink/70">
              Protégez votre compte avec un code demandé à chaque connexion.{" "}
              <b>
                {pro
                  ? "Obligatoire pour les comptes professionnels, qui accèdent à des données de santé."
                  : "Recommandé si vous partagez votre téléphone."}
              </b>
            </p>
            <button
              onClick={() => start.mutate()}
              disabled={start.isPending}
              className="flex items-center gap-2 rounded-lg bg-sunu-green px-4 py-2 text-xs font-semibold text-white"
            >
              <KeyRound className="size-4" /> Activer la double authentification
            </button>
          </div>
        )}
        <PasswordForm hasPassword={me?.has_password ?? true} />
        <OtherDevices />
      </div>
    </section>
  );
}

/** Téléphone perdu, ordinateur partagé, doute sur le compte : coupe toutes les autres sessions d'un clic. */
function OtherDevices() {
  const revoke = useMutation({
    mutationFn: logoutOtherDevices,
    onSuccess: (r) =>
      toast.success(
        r.closed
          ? `${r.closed} autre(s) appareil(s) déconnecté(s).`
          : "Aucun autre appareil n'était connecté.",
      ),
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-sunu-line pt-4">
      <p className="text-sunu-ink/70">
        Téléphone perdu ou ordinateur partagé ? Déconnectez immédiatement tous vos autres appareils
        (cet appareil reste connecté). Pensez ensuite à changer votre mot de passe.
      </p>
      <button
        onClick={() => {
          if (window.confirm("Déconnecter tous vos autres appareils maintenant ?")) revoke.mutate();
        }}
        disabled={revoke.isPending}
        className="flex items-center gap-2 rounded-lg border border-sunu-line px-4 py-2 text-xs font-semibold text-sunu-dark"
      >
        <MonitorSmartphone className="size-4" /> Déconnecter mes autres appareils
      </button>
    </div>
  );
}

function PasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: () =>
      changePassword({ current_password: hasPassword ? current : undefined, new_password: next }),
    onSuccess: () => {
      toast.success(hasPassword ? "Mot de passe modifié" : "Mot de passe enregistré");
      setOpen(false);
      setCurrent("");
      setNext("");
      setAgain("");
      qc.invalidateQueries({ queryKey: meQueryKey });
    },
    onError: (e) => toast.error(e.message),
  });
  const field = "w-full rounded-lg border border-sunu-line px-3 py-2";
  return (
    <div className="border-t border-sunu-line pt-4">
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 text-sm font-semibold text-sunu-green hover:underline"
        >
          <Lock className="size-4" />
          {hasPassword ? "Changer mon mot de passe" : "Créer un mot de passe"}
        </button>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (next !== again) return toast.error("Les deux mots de passe ne sont pas identiques");
            save.mutate();
          }}
          className="grid max-w-md gap-2"
        >
          {!hasPassword && (
            <p className="text-xs text-sunu-ink/60">
              Vous vous connectez par SMS. Un mot de passe vous permettra aussi de vous connecter
              avec votre email.
            </p>
          )}
          {hasPassword && (
            <input
              type="password"
              required
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              placeholder="Mot de passe actuel"
              autoComplete="current-password"
              className={field}
            />
          )}
          <input
            type="password"
            required
            minLength={10}
            value={next}
            onChange={(e) => setNext(e.target.value)}
            placeholder="Nouveau mot de passe (10 caractères au moins)"
            autoComplete="new-password"
            className={field}
          />
          <input
            type="password"
            required
            value={again}
            onChange={(e) => setAgain(e.target.value)}
            placeholder="Confirmer le nouveau mot de passe"
            autoComplete="new-password"
            className={field}
          />
          <div className="flex gap-2">
            <button
              disabled={save.isPending}
              className="rounded-lg bg-sunu-green px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              Enregistrer
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg border border-sunu-line px-4 py-2 text-xs font-semibold text-sunu-ink/70"
            >
              Annuler
            </button>
          </div>
          <p className="text-[11px] text-sunu-ink/50">
            Vos autres appareils seront déconnectés. Un email de confirmation vous est envoyé.
          </p>
        </form>
      )}
    </div>
  );
}
