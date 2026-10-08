/**
 * Clés d'accès du compte : ajouter l'empreinte, le visage, le code de l'appareil ou une clé USB, et retirer
 * celles qu'on n'utilise plus.
 *
 * Pourquoi le proposer en premier : un code à six chiffres se recopie sur un faux site, une clé d'accès non.
 * Le navigateur ne la présente qu'au vrai domaine de Fajma. C'est la seule protection qui ferme réellement
 * l'hameçonnage, qui est la façon la plus courante de voler un compte.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Fingerprint, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { addPasskey, listPasskeys, passkeysSupported, removePasskey } from "@/lib/passkeys";

const QUERY_KEY = ["passkeys"];

const since = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
    : null;

export function PasskeysSection() {
  const qc = useQueryClient();
  const supported = passkeysSupported();
  const { data } = useQuery({ queryKey: QUERY_KEY, queryFn: listPasskeys, enabled: supported });
  const [label, setLabel] = useState("");
  const keys = data?.passkeys ?? [];

  const add = useMutation({
    mutationFn: () => addPasskey(label.trim() || "Cet appareil"),
    onSuccess: () => {
      setLabel("");
      qc.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success("Clé d'accès enregistrée");
    },
    // Un refus du navigateur (annulation, appareil sans lecteur) remonte une erreur technique :
    // on affiche un message compréhensible plutôt que « NotAllowedError ».
    onError: (e: Error) =>
      toast.error(
        e.name === "NotAllowedError" || e.message.includes("annulée")
          ? "Création annulée ou refusée par l'appareil."
          : e.message,
      ),
  });
  const remove = useMutation({
    mutationFn: removePasskey,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success("Clé d'accès retirée");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!supported) return null;

  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-sunu-dark">
        <Fingerprint className="size-5 text-sunu-green" /> Clés d'accès
      </h2>
      <div className="grid gap-4 rounded-xl border border-sunu-line bg-sunu-card p-5 text-sm">
        <p className="text-sunu-ink/70">
          Connectez-vous avec votre empreinte, votre visage ou le code de votre téléphone, à la
          place du code à six chiffres.{" "}
          <strong className="font-semibold text-sunu-dark">
            Un faux site ne peut pas s'en servir
          </strong>
          , même si vous cliquez sur son lien : votre appareil ne présente la clé qu'au vrai site
          Fajma.
        </p>

        {keys.length > 0 && (
          <ul className="grid gap-2">
            {keys.map((k) => (
              <li
                key={k.id}
                className="flex min-w-0 flex-wrap items-center gap-3 rounded-lg border border-sunu-line px-3 py-2"
              >
                <Fingerprint className="size-4 shrink-0 text-sunu-teal" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-sunu-dark">{k.label}</span>
                  <span className="block text-xs text-sunu-ink/50">
                    {k.last_used_at
                      ? `Dernière utilisation le ${since(k.last_used_at)}`
                      : `Ajoutée le ${since(k.created_at)}, jamais utilisée`}
                  </span>
                </span>
                <button
                  onClick={() => remove.mutate(k.id)}
                  disabled={remove.isPending}
                  aria-label={`Retirer la clé ${k.label}`}
                  className="rounded-lg border border-red-200 p-2 text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            add.mutate();
          }}
          className="flex flex-wrap gap-2"
        >
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={60}
            placeholder="Nom de l'appareil (« mon téléphone »)"
            aria-label="Nom de l'appareil"
            className="min-w-0 flex-1 rounded-lg border border-sunu-line px-3 py-2"
          />
          <button
            disabled={add.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-sunu-green px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
          >
            <Plus className="size-4" /> Ajouter cet appareil
          </button>
        </form>
      </div>
    </section>
  );
}
