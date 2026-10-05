/**
 * Espace patient : qui m'aide (entraide familiale) — droits accordés, crédit santé offert, accepter une
 * invitation, retirer un droit ou tout l'accès. Lien vers l'espace « Famille » pour aider soi-même un proche.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { HeartHandshake } from "lucide-react";
import { toast } from "sonner";
import {
  acceptCareLink,
  fcfa,
  listCareLinks,
  revokeCareLink,
  updateCareLink,
  type CareLink,
} from "@/api/family";

export function FamilyHelpCard() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["care-links"], queryFn: listCareLinks });
  const refresh = () => qc.invalidateQueries({ queryKey: ["care-links"] });
  const act = useMutation({
    mutationFn: (v: {
      link: CareLink;
      action: "accept" | "revoke" | Partial<CareLink>;
    }): Promise<unknown> =>
      v.action === "accept"
        ? acceptCareLink(v.link.id)
        : v.action === "revoke"
          ? revokeCareLink(v.link.id)
          : updateCareLink(v.link.id, v.action),
    onSuccess: refresh,
    onError: (e) => toast.error(e.message),
  });
  const helpers = (data ?? []).filter((l) => l.role === "beneficiary");
  const helped = (data ?? []).filter((l) => l.role === "sponsor").length;

  return (
    <section className="rounded-2xl border border-sunu-line bg-sunu-card p-5">
      <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-sunu-ink/50">
        <HeartHandshake className="size-4" /> Entraide familiale
      </h2>
      {helpers.length === 0 ? (
        <p className="mt-2 text-xs text-sunu-ink/60">
          Un proche, même à l'étranger, peut payer vos consultations, vous offrir un crédit santé et
          vous aider à prendre rendez-vous, avec votre accord.
        </p>
      ) : (
        <ul className="mt-3 space-y-3">
          {helpers.map((l) => (
            <li key={l.id} className="rounded-xl bg-sunu-surface p-3 text-sm">
              <p className="font-semibold text-sunu-dark">{l.sponsor.full_name}</p>
              {l.status === "pending" ? (
                <div className="mt-1 text-xs text-sunu-ink/65">
                  Souhaite vous aider sur Fajma.
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={() => act.mutate({ link: l, action: "accept" })}
                      className="rounded-lg bg-sunu-green px-3 py-1.5 font-semibold text-white"
                    >
                      Accepter
                    </button>
                    <button
                      onClick={() => act.mutate({ link: l, action: "revoke" })}
                      className="rounded-lg border border-sunu-line px-3 py-1.5 font-semibold"
                    >
                      Refuser
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-1 space-y-1.5 text-xs text-sunu-ink/65">
                  <p>
                    Crédit santé offert : <b className="text-sunu-dark">{fcfa(l.balance)}</b>
                  </p>
                  {(
                    [
                      ["can_book", "Peut prendre mes rendez-vous"],
                      ["can_see_records", "Peut voir mes ordonnances et comptes-rendus"],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={l[key]}
                        onChange={(e) =>
                          act.mutate({ link: l, action: { [key]: e.target.checked } })
                        }
                      />
                      {label}
                    </label>
                  ))}
                  <p className="text-sunu-ink/50">Il peut toujours payer vos consultations.</p>
                  <button
                    onClick={() => {
                      if (window.confirm(`Retirer tout accès à ${l.sponsor.full_name} ?`))
                        act.mutate({ link: l, action: "revoke" });
                    }}
                    className="font-semibold text-red-600 hover:underline"
                  >
                    Retirer l'accès
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <Link to="/famille" className="mt-3 inline-block text-xs font-semibold text-sunu-green">
        {helped ? `Les proches que j'aide (${helped}) →` : "Aider un proche au Sénégal →"}
      </Link>
    </section>
  );
}
