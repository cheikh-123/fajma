/**
 * « Mon secrétariat » : le médecin donne à sa secrétaire l'accès à son agenda (prise de rendez-vous au guichet
 * ou au téléphone, confirmations, fichier patients), sans avoir à créer de « clinique ».
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Headset, LogOut, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { addMySecretary, getMySecretariat } from "@/api/doctor";
import { removeClinicMember, removeClinicStaff } from "@/api/clinic";

export function SecretariatPanel() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["pro-secretariat"], queryFn: getMySecretariat });
  const [email, setEmail] = useState("");
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["pro-secretariat"] });
    qc.invalidateQueries({ queryKey: ["my-clinic"] });
  };
  const add = useMutation({
    mutationFn: () => addMySecretary(email.trim()),
    onSuccess: () => {
      toast.success("Accès donné : la personne voit maintenant votre agenda dans « Ma clinique ».");
      setEmail("");
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => removeClinicStaff({ data: { id } }),
    onSuccess: () => {
      toast.success("Accès retiré");
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const leave = useMutation({
    mutationFn: (v: { clinic_id: string; member_id: string }) => removeClinicMember({ data: v }),
    onSuccess: () => {
      toast.success("Vous avez quitté l'établissement");
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <section
      aria-label="Mon secrétariat"
      className="rounded-2xl border border-sunu-line bg-sunu-card p-5"
    >
      <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-sunu-ink/50">
        <Headset className="size-4" /> Mon secrétariat
      </h2>
      <p className="mt-1 text-xs text-sunu-ink/55">
        Votre secrétaire prend et confirme vos rendez-vous (guichet, téléphone), même pour des
        patients sans compte, et tient votre fichier patients. Elle ne voit pas vos dossiers
        médicaux.
      </p>
      <div className="mt-3 grid gap-2">
        {(data?.secretaries ?? []).map((s) => (
          <div
            key={s.id}
            className="flex items-center justify-between gap-2 rounded-lg bg-sunu-surface px-3 py-2 text-sm"
          >
            <span className="min-w-0">
              <b className="block truncate text-sunu-dark">{s.full_name}</b>
              <span className="block truncate text-xs text-sunu-ink/55">
                {s.email}
                {s.phone ? ` · ${s.phone}` : ""}
              </span>
            </span>
            <button
              onClick={() => {
                if (window.confirm(`Retirer l'accès de ${s.full_name} à votre agenda ?`))
                  remove.mutate(s.id);
              }}
              aria-label={`Retirer ${s.full_name}`}
              className="text-sunu-ink/40 hover:text-red-600"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          add.mutate();
        }}
        className="mt-3 flex gap-2"
      >
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email de votre secrétaire"
          aria-label="Email de votre secrétaire"
          className="min-w-0 flex-1 rounded-lg border border-sunu-line bg-sunu-card px-3 py-2 text-sm"
        />
        <button
          disabled={add.isPending}
          className="flex items-center gap-1 rounded-lg bg-sunu-green px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
        >
          <UserPlus className="size-3.5" /> Ajouter
        </button>
      </form>
      <p className="mt-1.5 text-[11px] text-sunu-ink/50">
        Elle doit d'abord créer son compte Fajma (gratuit) avec cet email. Elle devra activer la
        double authentification.
      </p>
      {(data?.other_clinics ?? []).length > 0 && (
        <div className="mt-4 border-t border-sunu-line pt-3 text-xs text-sunu-ink/60">
          <p className="font-semibold text-sunu-ink/70">Vous exercez aussi dans :</p>
          {(data?.other_clinics ?? []).map((c) => (
            <p key={c.member_id} className="mt-1 flex items-center justify-between gap-2">
              <span>{c.name} (son secrétariat gère votre agenda)</span>
              <button
                onClick={() => {
                  if (
                    window.confirm(
                      `Quitter ${c.name} ? Son secrétariat n'aura plus accès à votre agenda.`,
                    )
                  )
                    leave.mutate({ clinic_id: c.clinic_id, member_id: c.member_id });
                }}
                className="flex shrink-0 items-center gap-1 font-semibold text-red-600 hover:underline"
              >
                <LogOut className="size-3" /> Quitter
              </button>
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
