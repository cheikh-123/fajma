/**
 * Adresse email du compte : ajout ou changement. La nouvelle adresse n'est enregistrée qu'après ouverture du lien
 * reçu à cette adresse ; mot de passe demandé si le compte en a un (pas pour un compte ouvert par SMS).
 */
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2, Mail, MailCheck } from "lucide-react";
import { toast } from "sonner";
import { cancelEmailChange, meQueryKey, requestEmailChange, useMe } from "@/api/auth";

export function EmailSetting() {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const [editing, setEditing] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  if (!me) return null;

  async function run(fn: () => Promise<unknown>, done: string) {
    setBusy(true);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: meQueryKey });
      toast.success(done);
      setEditing(false);
      setEmail("");
      setPassword("");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-sunu-line px-3 py-2.5 text-sm">
      <div className="flex items-center gap-2">
        <Mail className="size-4 shrink-0 text-sunu-green" />
        <span className={`min-w-0 flex-1 truncate ${me.email ? "" : "text-sunu-ink/50"}`}>
          {me.email ?? "Aucune adresse email"}
        </span>
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="shrink-0 text-xs font-semibold text-sunu-green hover:underline"
          >
            {me.email ? "Modifier" : "Ajouter"}
          </button>
        )}
      </div>
      {me.pending_email && !editing && (
        <p className="mt-2 flex flex-wrap items-center gap-1 text-xs text-amber-800">
          <MailCheck className="size-3.5" /> Lien de confirmation envoyé à{" "}
          <b className="break-all">{me.pending_email}</b> : ouvrez-le pour valider.
          <button
            type="button"
            disabled={busy}
            onClick={() => run(cancelEmailChange, "Demande annulée")}
            className="font-semibold underline"
          >
            Annuler
          </button>
        </p>
      )}
      {editing && (
        <form
          className="mt-2 grid gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(
              () => requestEmailChange({ email, password: password || undefined }),
              "Lien de confirmation envoyé : ouvrez-le depuis votre messagerie.",
            );
          }}
        >
          <input
            type="email"
            required
            autoComplete="email"
            aria-label="Nouvelle adresse email"
            placeholder="nom@exemple.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-lg border border-sunu-line px-3 py-2 text-sm outline-none focus:border-sunu-green"
          />
          {me.has_password !== false && (
            <input
              type="password"
              required
              autoComplete="current-password"
              aria-label="Mot de passe actuel"
              placeholder="Mot de passe actuel"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-lg border border-sunu-line px-3 py-2 text-sm outline-none focus:border-sunu-green"
            />
          )}
          <p className="text-xs text-sunu-ink/55">
            Vous recevrez un lien à cette adresse ; elle sera enregistrée quand vous l'ouvrirez.
          </p>
          <div className="flex gap-2">
            <button
              disabled={busy}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-sunu-green px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              {busy && <Loader2 className="size-3.5 animate-spin" />} Envoyer le lien
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-lg border border-sunu-line px-3 py-2 text-xs font-semibold text-sunu-ink/70"
            >
              Annuler
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
