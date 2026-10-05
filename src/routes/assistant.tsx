import { createFileRoute, Link } from "@tanstack/react-router";
import { ThemeToggle } from "@/lib/theme";
import { useMutation } from "@tanstack/react-query";
import { useState, useRef, useEffect } from "react";
import { Send, Sparkles, AlertTriangle, Stethoscope } from "lucide-react";
import { toast } from "sonner";
import { askSymptomAssistant } from "@/api/directory";
import { FajmaMark } from "@/components/FajmaMark";

export const Route = createFileRoute("/assistant")({
  head: () => ({
    meta: [
      { title: "Assistant IA symptômes — Fajma" },
      {
        name: "description",
        content:
          "Décrivez vos symptômes et l'assistant Fajma vous oriente vers la bonne spécialité médicale au Sénégal. Information, jamais un diagnostic.",
      },
      { property: "og:title", content: "Assistant IA symptômes — Fajma" },
      {
        property: "og:description",
        content:
          "Orientation médicale intelligente : trouvez la spécialité adaptée à vos symptômes.",
      },
    ],
  }),
  component: AssistantPage,
});

type Msg = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "J'ai de la fièvre et des maux de tête depuis 3 jours",
  "Mon enfant tousse beaucoup la nuit",
  "J'ai des douleurs au ventre après les repas",
  "Je vois flou depuis quelques jours",
];

function AssistantPage() {
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      content:
        "Bonjour 👋 Je suis l'assistant santé de Fajma. Décrivez-moi vos symptômes et je vous orienterai vers la bonne spécialité. Je ne remplace pas un médecin.",
    },
  ]);
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  const ask = useMutation({
    mutationFn: (history: Msg[]) => askSymptomAssistant({ data: { messages: history.slice(-12) } }),
    onSuccess: (res) => setMessages((m) => [...m, { role: "assistant", content: res.content }]),
    onError: (e: Error) => toast.error(e.message),
  });

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, ask.isPending]);

  function send(text: string) {
    const value = text.trim();
    if (!value || ask.isPending) return;
    const next: Msg[] = [...messages, { role: "user", content: value }];
    setMessages(next);
    setInput("");
    ask.mutate(next.slice(1));
  }

  return (
    <div className="flex min-h-screen flex-col bg-sunu-surface">
      <header className="border-b border-sunu-line bg-sunu-card">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-6">
          <Link to="/" className="flex items-center gap-2">
            <FajmaMark className="size-8" />
            <span className="text-xl font-bold text-sunu-green">Fajma</span>
          </Link>
          <ThemeToggle className="ml-auto mr-3" />
          <Link
            to="/medecins"
            className="inline-flex items-center gap-1.5 rounded-full bg-sunu-green px-4 py-2 text-sm font-semibold text-white hover:bg-sunu-green/90"
          >
            <Stethoscope className="size-4" /> Prendre RDV
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-6 py-8">
        <div className="flex items-center gap-2">
          <Sparkles className="size-5 text-sunu-teal" />
          <h1 className="text-2xl font-bold text-sunu-dark">Assistant symptômes</h1>
        </div>
        <div className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>
            Cet assistant fournit une orientation, pas un diagnostic. En cas d'urgence vitale,
            appelez le <strong>1515</strong> (SAMU) ou rendez-vous aux urgences.
          </p>
        </div>

        <div className="mt-6 flex-1 space-y-4">
          {messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
              <div
                className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  m.role === "user"
                    ? "bg-sunu-green text-white"
                    : "border border-sunu-line bg-sunu-card text-sunu-ink/80"
                }`}
              >
                {m.content}
              </div>
            </div>
          ))}
          {ask.isPending && (
            <div className="flex justify-start">
              <div className="rounded-2xl border border-sunu-line bg-sunu-card px-4 py-3 text-sm text-sunu-ink/50">
                L'assistant réfléchit…
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        {messages.length === 1 && (
          <div className="mt-6 flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="rounded-full border border-sunu-line bg-sunu-card px-3 py-2 text-xs font-medium text-sunu-ink/70 hover:border-sunu-green hover:text-sunu-green"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="sticky bottom-4 mt-6 flex items-center gap-2 rounded-2xl border border-sunu-line bg-sunu-card p-2 shadow-sm"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            maxLength={2000}
            placeholder="Décrivez vos symptômes…"
            className="w-full bg-transparent px-3 py-2 text-sm outline-none"
          />
          <button
            type="submit"
            disabled={ask.isPending || !input.trim()}
            className="grid size-10 shrink-0 place-items-center rounded-xl bg-sunu-green text-white transition hover:bg-sunu-green/90 disabled:opacity-40"
            aria-label="Envoyer"
          >
            <Send className="size-4" />
          </button>
        </form>
      </main>
    </div>
  );
}
