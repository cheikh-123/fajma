import { createFileRoute, useNavigate, useRouter, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import {
  Building2,
  ClipboardList,
  FlaskConical,
  Heart,
  Lock,
  Loader2,
  Mail,
  Pill,
  ShieldCheck,
  Smartphone,
  Stethoscope,
  User,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  confirmPasswordReset,
  demoLogin,
  getDemoLogin,
  login,
  loginMfa,
  meQueryKey,
  register,
  requestOtp,
  requestPasswordReset,
  verifyOtp,
  type DemoAccount,
} from "@/api/auth";
import { LanguageSwitcher, useI18n, type TKey } from "@/lib/i18n";
import { ThemeToggle } from "@/lib/theme";

export const Route = createFileRoute("/auth")({
  // uid + token : lien de réinitialisation reçu par email.
  validateSearch: (s) =>
    z
      .object({
        uid: z.string().optional(),
        token: z.string().optional(),
        redirect: z.string().optional(),
        expired: z.union([z.number(), z.string()]).optional(),
      })
      .parse(s),
  head: () => ({
    meta: [
      { title: "Connexion — Fajma" },
      {
        name: "description",
        content: "Connectez-vous ou créez votre compte Fajma pour prendre rendez-vous en ligne.",
      },
      { property: "og:title", content: "Connexion — Fajma" },
      { property: "og:description", content: "Accédez à votre espace santé au Sénégal." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

type Mode = "signin" | "signup" | "reset" | "newPassword" | "mfa";

const TITLES: Record<Mode, [TKey, TKey]> = {
  mfa: ["auth.mfa", "auth.mfaSub"],
  signin: ["auth.signin", "auth.signinSub"],
  signup: ["auth.signup", "auth.signupSub"],
  reset: ["auth.reset", "auth.resetSub"],
  newPassword: ["auth.newPwd", "auth.newPwdSub"],
};

/** Retour après connexion : uniquement une page de ce site (jamais « //autre-site.com » ni une URL complète). */
function safeRedirect(value?: string) {
  return value && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/auth")
    ? value
    : null;
}

/** Choix de langue explicite sur cet appareil ? (sinon on adopte celui du compte à la connexion). */
function hasLocalLanguage() {
  try {
    return Boolean(localStorage.getItem("sunu-lang"));
  } catch {
    return false;
  }
}

function AuthPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { t, lang, setLang } = useI18n();
  const { uid, token, redirect, expired } = Route.useSearch();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(uid && token ? "newPassword" : "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  // Au Sénégal, le téléphone est le moyen de connexion le plus courant : c'est le choix par défaut.
  const [method, setMethod] = useState<"phone" | "email">(uid && token ? "email" : "phone");

  async function onLoggedIn(user: import("@/api/types").User, created = false) {
    qc.setQueryData(meQueryKey, user);
    await qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== "me" });
    toast.success(t(created ? "auth.created" : "auth.loggedIn"));
    // Langue : celle choisie sur cet appareil est enregistrée sur le compte, sinon celle du compte s'applique.
    setLang(hasLocalLanguage() ? lang : (user.preferred_language ?? "fr"));
    const back = safeRedirect(redirect);
    // Console technique : page servie par Django, hors de l'application.
    if (back?.startsWith("/django-admin/") && !user.mfa_setup_required)
      window.location.assign(back);
    else if (user.mfa_setup_required) navigate({ to: "/securite" });
    else if (back) router.history.push(back);
    else
      navigate({
        to: user.is_admin
          ? "/admin"
          : user.is_doctor
            ? "/pro"
            : user.is_pharmacist
              ? "/pharmacie"
              : user.is_lab
                ? "/laboratoire"
                : user.is_clinic_staff
                  ? "/clinique"
                  : "/mon-espace",
      });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "reset") {
        await requestPasswordReset(email);
        toast.success(t("auth.resetSent"));
        setMode("signin");
        return;
      }
      if (mode === "newPassword") {
        await confirmPasswordReset({ uid: uid ?? "", token: token ?? "", password });
        toast.success(t("auth.pwdChanged"));
        setPassword("");
        setMode("signin");
        navigate({ to: "/auth", search: {} });
        return;
      }
      let user;
      if (mode === "mfa") {
        user = await loginMfa(code);
      } else if (mode === "signup") {
        user = await register({ email, password, full_name: fullName });
      } else {
        user = await login({ email, password });
        if (!user) {
          // Compte protégé par la double authentification : on demande le code.
          setMode("mfa");
          return;
        }
      }
      await onLoggedIn(user, mode === "signup");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  const [title, subtitle] = TITLES[mode].map((k) => t(k));
  const needsPassword = mode !== "reset" && mode !== "mfa";
  const needsEmail = mode !== "newPassword" && mode !== "mfa";

  return (
    <div className="min-h-screen bg-sunu-surface">
      <header className="border-b border-sunu-line bg-sunu-card">
        <div className="mx-auto flex h-16 max-w-7xl items-center px-6">
          <Link to="/" className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-lg bg-sunu-green text-white">
              <Heart className="size-4" strokeWidth={2.5} />
            </span>
            <span className="text-xl font-bold text-sunu-green">Fajma</span>
          </Link>
          <ThemeToggle className="ml-auto" />
          <LanguageSwitcher />
        </div>
      </header>
      <main className="mx-auto grid max-w-md gap-6 px-6 py-12">
        <DemoAccess redirect={redirect} />
        {expired && (
          <p
            role="status"
            className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          >
            Par sécurité, votre session a été fermée après une période sans activité.
            Reconnectez-vous pour continuer.
          </p>
        )}
        <div className="rounded-2xl border border-sunu-line bg-sunu-card p-8 shadow-sunu-card">
          {method === "phone" && mode !== "mfa" ? (
            <PhoneLogin
              onUser={onLoggedIn}
              onMfa={() => setMode("mfa")}
              onUseEmail={() => {
                setMethod("email");
                setMode("signin");
              }}
            />
          ) : (
            <>
              <h1 className="text-2xl font-bold text-sunu-dark">{title}</h1>
              <p className="mt-1 text-sm text-sunu-ink/60">{subtitle}</p>

              <form onSubmit={handleSubmit} className="mt-6 space-y-3">
                {mode === "signup" && (
                  <label className="flex items-center gap-3 rounded-xl border border-sunu-line bg-sunu-card px-4 py-3 focus-within:border-sunu-green">
                    <User className="size-4 text-sunu-ink/40" />
                    <input
                      required
                      minLength={2}
                      autoComplete="name"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder={t("auth.name")}
                      className="flex-1 bg-transparent text-sm outline-none"
                    />
                  </label>
                )}
                {needsEmail && (
                  <label className="flex items-center gap-3 rounded-xl border border-sunu-line bg-sunu-card px-4 py-3 focus-within:border-sunu-green">
                    <Mail className="size-4 text-sunu-ink/40" />
                    <input
                      type="email"
                      required
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Email"
                      className="flex-1 bg-transparent text-sm outline-none"
                    />
                  </label>
                )}
                {mode === "mfa" && (
                  <input
                    required
                    autoFocus
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder={t("auth.code6")}
                    aria-label="Code de vérification"
                    className="w-full rounded-xl border border-sunu-line px-4 py-3 text-center text-lg tracking-[0.4em] outline-none focus:border-sunu-green"
                  />
                )}
                {needsPassword && (
                  <label className="flex items-center gap-3 rounded-xl border border-sunu-line bg-sunu-card px-4 py-3 focus-within:border-sunu-green">
                    <Lock className="size-4 text-sunu-ink/40" />
                    <input
                      type="password"
                      required
                      minLength={mode === "signin" ? 1 : 10}
                      autoComplete={mode === "signin" ? "current-password" : "new-password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={t(mode === "signin" ? "auth.password" : "auth.passwordNew")}
                      className="flex-1 bg-transparent text-sm outline-none"
                    />
                  </label>
                )}
                <button
                  type="submit"
                  disabled={loading}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-sunu-green px-4 py-3 text-sm font-semibold text-white hover:bg-sunu-green/90 disabled:opacity-50"
                >
                  {loading && <Loader2 className="size-4 animate-spin" />}
                  {t(
                    (
                      {
                        signin: "auth.submitSignin",
                        signup: "auth.createAccount",
                        reset: "auth.submitReset",
                        newPassword: "auth.save",
                        mfa: "auth.validate",
                      } as const
                    )[mode],
                  )}
                </button>
              </form>

              {mode === "signin" && (
                <button
                  onClick={() => setMode("reset")}
                  className="mt-4 w-full text-center text-xs font-semibold text-sunu-green hover:underline"
                >
                  {t("auth.forgot")}
                </button>
              )}
              {mode === "reset" || mode === "newPassword" || mode === "mfa" ? (
                <button
                  onClick={() => setMode("signin")}
                  className="mt-5 w-full text-center text-sm font-semibold text-sunu-green"
                >
                  {t("auth.backToLogin")}
                </button>
              ) : (
                <p className="mt-6 text-center text-sm text-sunu-ink/60">
                  {t(mode === "signin" ? "auth.noAccount" : "auth.hasAccount")}{" "}
                  <button
                    type="button"
                    onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
                    className="font-semibold text-sunu-green hover:underline"
                  >
                    {t(mode === "signin" ? "auth.signup" : "auth.submitSignin")}
                  </button>
                </p>
              )}
              {mode !== "mfa" && mode !== "newPassword" && (
                <button
                  type="button"
                  onClick={() => setMethod("phone")}
                  className="mt-3 flex w-full items-center justify-center gap-2 text-sm font-semibold text-sunu-green hover:underline"
                >
                  <Smartphone className="size-4" /> {t("auth.usePhone")}
                </button>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}

const DEMO: { id: DemoAccount; label: string; icon: LucideIcon; to: string }[] = [
  { id: "patient", label: "Patient", icon: User, to: "/mon-espace" },
  { id: "medecin", label: "Médecin", icon: Stethoscope, to: "/pro" },
  { id: "pharmacie", label: "Pharmacie", icon: Pill, to: "/pharmacie" },
  { id: "clinique", label: "Clinique", icon: Building2, to: "/clinique" },
  { id: "secretariat", label: "Secrétariat", icon: ClipboardList, to: "/clinique" },
  { id: "laboratoire", label: "Laboratoire", icon: FlaskConical, to: "/laboratoire" },
  { id: "admin", label: "Administrateur", icon: ShieldCheck, to: "/admin" },
];

/**
 * Accès démo sans identification : un clic ouvre l'espace choisi avec un compte de démonstration.
 * Affiché seulement quand le serveur l'autorise (développement uniquement, jamais en production).
 */
function DemoAccess({ redirect }: { redirect?: string }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const router = useRouter();
  const [pending, setPending] = useState<DemoAccount | null>(null);
  const { data } = useQuery({
    queryKey: ["demo-login"],
    queryFn: getDemoLogin,
    retry: false,
    staleTime: Infinity,
  });
  if (!data?.enabled) return null;

  async function enter(account: (typeof DEMO)[number]) {
    setPending(account.id);
    try {
      const user = await demoLogin(account.id);
      qc.setQueryData(meQueryKey, user);
      await qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== "me" });
      const back = safeRedirect(redirect);
      if (back?.startsWith("/django-admin/")) window.location.assign(back);
      else if (back) router.history.push(back);
      else navigate({ to: account.to });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="rounded-2xl border-2 border-dashed border-sunu-gold bg-sunu-card p-6">
      <h2 className="font-bold text-sunu-dark">Accès démo — sans identification</h2>
      <p className="mt-1 text-sm text-sunu-ink/60">
        Entrez directement dans un espace avec un compte de démonstration.
      </p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        {DEMO.map((a) => (
          <button
            key={a.id}
            type="button"
            disabled={pending !== null}
            onClick={() => enter(a)}
            className="flex items-center gap-2 rounded-xl border border-sunu-line px-3 py-2.5 text-sm font-semibold text-sunu-dark hover:border-sunu-green hover:text-sunu-green disabled:opacity-50"
          >
            {pending === a.id ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <a.icon className="size-4 shrink-0 text-sunu-green" />
            )}
            {a.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Connexion ou inscription par numéro de téléphone : code SMS à 6 chiffres. */
function PhoneLogin({
  onUser,
  onMfa,
  onUseEmail,
}: {
  onUser: (user: import("@/api/types").User, created?: boolean) => void;
  onMfa: () => void;
  onUseEmail: () => void;
}) {
  const [step, setStep] = useState<"phone" | "code" | "name">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const { t } = useI18n();

  async function run(fn: () => Promise<void>) {
    setLoading(true);
    try {
      await fn();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  const sendCode = () =>
    run(async () => {
      const res = await requestOtp(phone);
      setPhone(res.phone);
      setStep("code");
      // En développement local (sans Twilio), le serveur renvoie le code pour pouvoir tester.
      if (res.dev_code) toast.info(t("auth.testCode", { code: res.dev_code }), { duration: 20000 });
      else toast.success(t("auth.codeSent"));
    });

  const verify = (withName: boolean) =>
    run(async () => {
      const res = await verifyOtp(withName ? { phone, full_name: fullName } : { phone, code });
      if (res.mfa_required) return onMfa();
      if (res.needs_name) return setStep("name");
      if (res.user) onUser(res.user, withName);
    });

  return (
    <div>
      <h1 className="text-2xl font-bold text-sunu-dark">
        {t(step === "name" ? "auth.welcome" : "auth.phoneTitle")}
      </h1>
      <p className="mt-1 text-sm text-sunu-ink/60">
        {step === "phone" && t("auth.phoneIntro")}
        {step === "code" && t("auth.codeIntro", { phone })}
        {step === "name" && t("auth.nameIntro")}
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (step === "phone") sendCode();
          else verify(step === "name");
        }}
        className="mt-6 space-y-3"
      >
        {step === "phone" && (
          <label className="flex items-center gap-3 rounded-xl border border-sunu-line bg-sunu-card px-4 py-3 focus-within:border-sunu-green">
            <Smartphone className="size-4 text-sunu-ink/40" />
            <span className="text-sm font-semibold text-sunu-ink/60">+221</span>
            <input
              required
              autoFocus
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="77 123 45 67"
              aria-label={t("auth.phone")}
              className="flex-1 bg-transparent text-sm outline-none"
            />
          </label>
        )}
        {step === "code" && (
          <input
            required
            autoFocus
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            placeholder="••••••"
            aria-label={t("auth.codeLabel")}
            className="w-full rounded-xl border border-sunu-line px-4 py-3 text-center text-2xl tracking-[0.5em] outline-none focus:border-sunu-green"
          />
        )}
        {step === "name" && (
          <label className="flex items-center gap-3 rounded-xl border border-sunu-line bg-sunu-card px-4 py-3 focus-within:border-sunu-green">
            <User className="size-4 text-sunu-ink/40" />
            <input
              required
              autoFocus
              minLength={2}
              autoComplete="name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder={t("auth.fullName")}
              aria-label={t("auth.fullName")}
              className="flex-1 bg-transparent text-sm outline-none"
            />
          </label>
        )}
        <button
          type="submit"
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-sunu-green px-4 py-3 text-sm font-semibold text-white hover:bg-sunu-green/90 disabled:opacity-50"
        >
          {loading && <Loader2 className="size-4 animate-spin" />}
          {t(
            step === "phone"
              ? "auth.getCode"
              : step === "code"
                ? "auth.validate"
                : "auth.createAccount",
          )}
        </button>
      </form>
      {step === "code" && (
        <button
          onClick={() => {
            setStep("phone");
            setCode("");
          }}
          className="mt-3 w-full text-center text-xs font-semibold text-sunu-green hover:underline"
        >
          {t("auth.changeNumber")}
        </button>
      )}
      <div className="my-5 flex items-center gap-3 text-xs text-sunu-ink/40">
        <span className="h-px flex-1 bg-sunu-line" />
        {t("auth.or")}
        <span className="h-px flex-1 bg-sunu-line" />
      </div>
      <button
        type="button"
        onClick={onUseEmail}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-sunu-line px-4 py-3 text-sm font-semibold text-sunu-ink/80 hover:border-sunu-green"
      >
        <Mail className="size-4" /> {t("auth.useEmail")}
      </button>
      <p className="mt-4 text-center text-[11px] text-sunu-ink/50">
        {t("auth.consent")}{" "}
        <a href="/cgu" className="underline">
          {t("auth.terms")}
        </a>{" "}
        {t("auth.and")}{" "}
        <a href="/confidentialite" className="underline">
          {t("auth.privacy")}
        </a>
        .
      </p>
    </div>
  );
}
