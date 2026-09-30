import { Link } from "@tanstack/react-router";
import { ThemeToggle } from "@/lib/theme";
import type { ReactNode } from "react";
import { ArrowLeft, Heart } from "lucide-react";

/** Mise en page commune des pages juridiques (CGU, confidentialité, mentions légales). */
export function LegalLayout({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-sunu-surface">
      <header className="border-b border-sunu-line bg-sunu-card">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-lg bg-sunu-green text-white">
              <Heart className="size-4" />
            </span>
            <span className="font-bold text-sunu-green">Fajma</span>
          </Link>
          <ThemeToggle className="ml-auto mr-3" />
          <Link to="/" className="flex items-center gap-1 text-sm font-semibold text-sunu-ink/60">
            <ArrowLeft className="size-4" /> Accueil
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <b>Projet de document</b> — à faire relire et valider par un juriste avant la mise en
          ligne publique.
        </p>
        <h1 className="mt-6 text-3xl font-bold text-sunu-dark">{title}</h1>
        <p className="mt-2 text-sm text-sunu-ink/60">Dernière mise à jour : {updated}</p>
        <div className="legal mt-8 space-y-6 text-sm leading-7 text-sunu-ink/80 [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-sunu-dark [&_li]:ml-5 [&_li]:list-disc">
          {children}
        </div>
        <nav className="mt-12 flex flex-wrap gap-4 border-t border-sunu-line pt-6 text-sm font-semibold text-sunu-green">
          <Link to="/cgu">Conditions d'utilisation</Link>
          <Link to="/confidentialite">Politique de confidentialité</Link>
          <Link to="/legal">Mentions légales</Link>
        </nav>
      </main>
    </div>
  );
}
