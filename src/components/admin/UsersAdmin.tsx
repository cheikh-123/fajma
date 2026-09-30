/** Administration : retrouver un compte (support), le suspendre ou le réactiver, réinitialiser sa double authentification. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Ban, KeyRound, Loader2, RotateCcw, Search, Users } from "lucide-react";
import { toast } from "sonner";
import { adminUserAction, searchUsers, type AdminUser } from "@/api/admin";
import { formatDate } from "@/lib/datetime";

const ROLE_LABELS: Record<AdminUser["roles"][number], string> = {
  patient: "Patient",
  doctor: "Médecin",
  pharmacist: "Pharmacien",
  lab: "Laboratoire",
  clinic_owner: "Responsable de clinique",
  clinic_staff: "Secrétariat",
  admin: "Administrateur",
};

export function UsersAdmin() {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [suspendedOnly, setSuspendedOnly] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(q.trim()), 350);
    return () => clearTimeout(id);
  }, [q]);
  const { data, isFetching } = useQuery({
    queryKey: ["admin-users", debounced, suspendedOnly],
    queryFn: () => searchUsers(debounced, suspendedOnly),
  });

  return (
    <section className="rounded-xl border border-sunu-line bg-sunu-card p-5">
      <h2 className="flex items-center gap-2 font-bold text-sunu-dark">
        <Users className="size-5 text-sunu-green" /> Comptes utilisateurs
      </h2>
      <p className="mt-1 text-xs text-sunu-ink/55">
        Retrouvez une personne qui appelle le support (nom, email ou téléphone). Chaque recherche et
        chaque action sont inscrites au journal.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-sunu-line px-3">
          <Search className="size-4 text-sunu-ink/40" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Nom, email ou téléphone"
            aria-label="Rechercher un compte"
            className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none"
          />
          {isFetching && <Loader2 className="size-4 animate-spin text-sunu-ink/40" />}
        </label>
        <label className="flex items-center gap-2 text-xs font-semibold text-sunu-ink/70">
          <input
            type="checkbox"
            checked={suspendedOnly}
            onChange={(e) => setSuspendedOnly(e.target.checked)}
            className="accent-sunu-green"
          />
          Comptes suspendus
        </label>
      </div>
      <div className="mt-3 max-h-[28rem] divide-y divide-sunu-line overflow-y-auto">
        {(data ?? []).length === 0 && (
          <p className="py-6 text-center text-sm text-sunu-ink/50">Aucun compte trouvé.</p>
        )}
        {(data ?? []).map((u) => (
          <UserRow key={u.id} user={u} />
        ))}
      </div>
    </section>
  );
}

function UserRow({ user }: { user: AdminUser }) {
  const qc = useQueryClient();
  const act = useMutation({
    mutationFn: (v: { action: "suspend" | "reactivate" | "reset_mfa"; reason?: string }) =>
      adminUserAction(user.id, v.action, v.reason),
    onSuccess: (_res, v) => {
      toast.success(
        v.action === "suspend"
          ? "Compte suspendu : la personne est déconnectée partout"
          : v.action === "reactivate"
            ? user.doctor
              ? "Compte réactivé. Revalidez la fiche médecin pour la republier."
              : "Compte réactivé"
            : "Double authentification réinitialisée : elle devra la réactiver à sa prochaine connexion",
      );
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      qc.invalidateQueries({ queryKey: ["admin-overview"] });
    },
    onError: (e) => toast.error(e.message),
  });
  const ask = (action: "suspend" | "reset_mfa", question: string) => {
    const reason = window.prompt(question);
    if (reason === null) return;
    act.mutate({ action, reason });
  };
  return (
    <div className="flex flex-wrap items-center gap-3 py-3 text-sm">
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-sunu-dark">
          {user.full_name ?? "Sans nom"}
          {!user.is_active && (
            <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">
              Suspendu
            </span>
          )}
        </p>
        <p className="truncate text-xs text-sunu-ink/60">
          {[user.email, user.phone, user.city].filter(Boolean).join(" · ")}
        </p>
        <p className="mt-0.5 text-[11px] text-sunu-ink/50">
          {user.roles.map((r) => ROLE_LABELS[r]).join(", ")} · inscrit le{" "}
          {formatDate(user.date_joined)}
          {user.last_login ? ` · dernière connexion ${formatDate(user.last_login)}` : ""}
          {user.mfa_enabled ? " · double authentification ✓" : ""}
          {user.upcoming_appointments ? ` · ${user.upcoming_appointments} RDV à venir` : ""}
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {user.mfa_enabled && (
          <button
            onClick={() =>
              ask(
                "reset_mfa",
                "Réinitialiser la double authentification (téléphone perdu) ?\nVérifiez d'abord l'identité de la personne. Motif :",
              )
            }
            disabled={act.isPending}
            className="flex items-center gap-1 rounded-lg border border-sunu-line px-2.5 py-1.5 text-xs font-semibold text-sunu-ink/70"
          >
            <KeyRound className="size-3.5" /> 2FA
          </button>
        )}
        {user.is_active ? (
          <button
            onClick={() =>
              ask(
                "suspend",
                `Suspendre ${user.full_name ?? "ce compte"} ?\nIl sera déconnecté partout${user.doctor ? " et sa fiche retirée de l'annuaire" : ""}. Motif (conservé au journal) :`,
              )
            }
            disabled={act.isPending}
            className="flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-semibold text-red-600"
          >
            <Ban className="size-3.5" /> Suspendre
          </button>
        ) : (
          <button
            onClick={() => act.mutate({ action: "reactivate" })}
            disabled={act.isPending}
            className="flex items-center gap-1 rounded-lg border border-sunu-teal px-2.5 py-1.5 text-xs font-semibold text-sunu-teal"
          >
            <RotateCcw className="size-3.5" /> Réactiver
          </button>
        )}
      </div>
    </div>
  );
}
