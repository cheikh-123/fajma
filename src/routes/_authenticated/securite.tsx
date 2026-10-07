import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { BackButton } from "@/components/BackButton";
import { useQueryClient } from "@tanstack/react-query";
import { LogOut, ShieldAlert } from "lucide-react";
import { SecuritySection } from "@/components/SecuritySection";
import { logout, useMe } from "@/api/auth";
import { ThemeToggle } from "@/lib/theme";
import { FajmaMark } from "@/components/FajmaMark";

export const Route = createFileRoute("/_authenticated/securite")({
  head: () => ({
    meta: [{ title: "Sécurité du compte — Fajma" }, { name: "robots", content: "noindex" }],
  }),
  component: SecurityPage,
});

/**
 * Sécurité du compte. Page imposée aux professionnels (médecins, pharmaciens, cliniques, administration)
 * tant que la double authentification n'est pas activée.
 */
function SecurityPage() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const required = Boolean(me?.mfa_setup_required);
  const home = me?.is_admin
    ? "/admin"
    : me?.is_doctor
      ? "/pro"
      : me?.is_pharmacist
        ? "/pharmacie"
        : me?.is_lab
          ? "/laboratoire"
          : "/mon-espace";

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await logout();
    navigate({ to: "/", replace: true });
  }

  return (
    <div className="min-h-screen bg-sunu-surface">
      <header className="border-b border-sunu-line bg-sunu-card">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between gap-3 px-4 sm:px-6">
          <BackButton to="/mon-espace" />
          <span className="mr-auto flex items-center gap-2">
            <FajmaMark className="size-8" />
            <span className="text-xl font-bold text-sunu-green">Fajma</span>
          </span>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <button
              onClick={signOut}
              className="flex items-center gap-1.5 text-sm font-medium text-sunu-ink/60 hover:text-sunu-green"
            >
              <LogOut className="size-4" /> Déconnexion
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        {required ? (
          <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-5 text-amber-900">
            <p className="flex items-center gap-2 font-bold">
              <ShieldAlert className="size-5" /> Une étape de sécurité avant de continuer
            </p>
            <p className="mt-2 text-sm">
              Votre compte donne accès à des données de santé : la double authentification est
              obligatoire. À chaque connexion, en plus du mot de passe, vous saisirez un code à 6
              chiffres affiché par une application gratuite sur votre téléphone.
            </p>
            <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm">
              <li>
                Installez <b>Google Authenticator</b> ou <b>Microsoft Authenticator</b> (Play Store
                ou App Store).
              </li>
              <li>Cliquez sur « Activer la double authentification » ci-dessous.</li>
              <li>Scannez le code QR avec l'application, puis saisissez le code affiché.</li>
              <li>
                <b>Notez vos codes de secours</b> et gardez-les en lieu sûr : ils servent si vous
                perdez votre téléphone.
              </li>
            </ol>
          </div>
        ) : (
          <Link
            to={home}
            className="mb-6 inline-flex rounded-lg bg-sunu-green px-4 py-2 text-sm font-semibold text-white"
          >
            Continuer vers mon espace →
          </Link>
        )}
        <SecuritySection />
      </main>
    </div>
  );
}
