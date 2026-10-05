/** Lien reçu par email : confirme la nouvelle adresse du compte (fonctionne aussi sur un autre appareil). */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { confirmEmailChange, meQueryKey } from "@/api/auth";
import { FajmaMark } from "@/components/FajmaMark";

export const Route = createFileRoute("/confirmer-email")({
  validateSearch: (s) => z.object({ token: z.string().optional() }).parse(s),
  head: () => ({
    meta: [
      { title: "Confirmation de l'adresse email — Fajma" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ConfirmEmailPage,
});

function ConfirmEmailPage() {
  const { token } = Route.useSearch();
  const qc = useQueryClient();
  const [state, setState] = useState<{ ok: boolean; message: string } | null>(null);
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    if (!token) {
      setState({ ok: false, message: "Lien incomplet : ouvrez le lien reçu par email." });
      return;
    }
    confirmEmailChange(token)
      .then((r) => {
        qc.invalidateQueries({ queryKey: meQueryKey });
        setState({ ok: true, message: `Votre adresse est désormais ${r.email}.` });
      })
      .catch((e: Error) => setState({ ok: false, message: e.message }));
  }, [token, qc]);

  return (
    <main className="grid min-h-screen place-items-center bg-sunu-surface px-4">
      <div className="w-full max-w-md rounded-2xl border border-sunu-line bg-sunu-card p-8 text-center">
        <FajmaMark className="mx-auto size-10" />
        {!state ? (
          <Loader2 className="mx-auto mt-6 size-6 animate-spin text-sunu-ink/40" />
        ) : (
          <>
            {state.ok ? (
              <CheckCircle2 className="mx-auto mt-6 size-10 text-sunu-teal" />
            ) : (
              <XCircle className="mx-auto mt-6 size-10 text-red-600" />
            )}
            <h1 className="mt-3 text-xl font-bold text-sunu-dark">
              {state.ok ? "Adresse email confirmée" : "Confirmation impossible"}
            </h1>
            <p className="mt-2 text-sm text-sunu-ink/70">{state.message}</p>
          </>
        )}
        <Link to="/" className="mt-6 inline-block text-sm font-semibold text-sunu-green">
          Retour à l'accueil
        </Link>
      </div>
    </main>
  );
}
