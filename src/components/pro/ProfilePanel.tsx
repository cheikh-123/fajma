/** Fiche publique du médecin : photo, présentation, tarif, langues, téléconsultation, adresse. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Camera, ExternalLink, Loader2, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { DOCTOR_LANGUAGES, editMyDoctorProfile, uploadMyPhoto } from "@/api/doctor";
import { listSpecialties } from "@/api/directory";
import type { DoctorProfile } from "@/api/types";

const MAX_PHOTO = 2_000_000;

function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("Lecture du fichier impossible"));
    reader.readAsDataURL(file);
  });
}

export function ProfilePanel({ profile }: { profile: DoctorProfile }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["my-doctor-profile"] });

  const photo = useMutation({
    mutationFn: async (file: File | null) => {
      if (file && !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        throw new Error("Choisissez une photo JPEG, PNG ou WebP");
      }
      if (file && file.size > MAX_PHOTO) throw new Error("Photo trop lourde (2 Mo au plus)");
      return uploadMyPhoto(file ? await readBase64(file) : "");
    },
    onSuccess: (r) => {
      toast.success(r.avatar_url ? "Photo mise à jour" : "Photo retirée");
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });

  const initial = profile.full_name.replace(/^Dr\.?\s*/i, "").charAt(0);
  return (
    <section
      aria-label="Ma fiche publique"
      className="rounded-2xl border border-sunu-line bg-sunu-card p-5"
    >
      <div className="flex items-center gap-4">
        <div className="relative shrink-0">
          {profile.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt={`Photo de ${profile.full_name}`}
              className="size-16 rounded-full object-cover"
            />
          ) : (
            <span className="grid size-16 place-items-center rounded-full bg-sunu-green-soft text-2xl font-bold text-sunu-green">
              {initial}
            </span>
          )}
          <button
            onClick={() => fileRef.current?.click()}
            disabled={photo.isPending}
            aria-label="Changer ma photo"
            className="absolute -bottom-1 -right-1 grid size-7 place-items-center rounded-full bg-sunu-green text-white shadow"
          >
            {photo.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Camera className="size-3.5" />
            )}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) photo.mutate(file);
            }}
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-wider text-sunu-ink/50">
            Ma fiche publique
          </p>
          <p className="truncate font-bold text-sunu-dark">{profile.full_name}</p>
          <p className="text-xs text-sunu-ink/60">
            {profile.specialty?.name} · {profile.consultation_price.toLocaleString("fr-FR")} F
          </p>
          <div className="mt-1 flex flex-wrap gap-3 text-xs font-semibold">
            <button
              onClick={() => setOpen((v) => !v)}
              className="flex items-center gap-1 text-sunu-green"
            >
              <Pencil className="size-3" /> {open ? "Fermer" : "Modifier"}
            </button>
            {profile.is_verified && (
              <Link
                to="/medecins/$id"
                params={{ id: profile.id }}
                className="flex items-center gap-1 text-sunu-ink/60 hover:text-sunu-green"
              >
                <ExternalLink className="size-3" /> Voir ma fiche
              </Link>
            )}
            {profile.avatar_url && (
              <button
                onClick={() => photo.mutate(null)}
                className="flex items-center gap-1 text-sunu-ink/50 hover:text-red-600"
              >
                <Trash2 className="size-3" /> Retirer la photo
              </button>
            )}
          </div>
        </div>
      </div>
      {open && (
        <ProfileForm
          profile={profile}
          onSaved={() => {
            setOpen(false);
            refresh();
          }}
        />
      )}
    </section>
  );
}

function ProfileForm({ profile, onSaved }: { profile: DoctorProfile; onSaved: () => void }) {
  const qc = useQueryClient();
  const { data: specs } = useQuery({ queryKey: ["specialties"], queryFn: () => listSpecialties() });
  const [form, setForm] = useState({
    full_name: profile.full_name,
    specialty_id: profile.specialty?.id ?? "",
    bio: profile.bio ?? "",
    years_experience: profile.years_experience,
    consultation_price: profile.consultation_price,
    teleconsultation: profile.teleconsultation,
    languages: profile.languages.length ? profile.languages : ["Français"],
    city: profile.city,
    address: profile.address ?? "",
  });
  const locked = profile.is_verified;
  const save = useMutation({
    mutationFn: () =>
      editMyDoctorProfile({
        ...form,
        // Fiche vérifiée : nom et spécialité ne sont pas renvoyés (ils ne changent plus en ligne).
        full_name: locked ? undefined : form.full_name,
        specialty_id: locked ? undefined : form.specialty_id,
      }),
    onSuccess: () => {
      toast.success("Fiche mise à jour");
      qc.invalidateQueries({ queryKey: ["pro-settings"] });
      onSaved();
    },
    onError: (e) => toast.error(e.message),
  });
  const field =
    "w-full rounded-lg border border-sunu-line bg-sunu-card px-3 py-2 text-sm outline-none focus:border-sunu-green";
  const toggleLang = (l: string) =>
    setForm({
      ...form,
      languages: form.languages.includes(l)
        ? form.languages.filter((x) => x !== l)
        : [...form.languages, l],
    });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (form.languages.length === 0) return toast.error("Choisissez au moins une langue");
        save.mutate();
      }}
      className="mt-4 grid gap-3 border-t border-sunu-line pt-4 text-sm"
    >
      <label className="grid gap-1 text-xs text-sunu-ink/60">
        Nom affiché
        <input
          required
          disabled={locked}
          value={form.full_name}
          onChange={(e) => setForm({ ...form, full_name: e.target.value })}
          className={`${field} disabled:opacity-60`}
        />
      </label>
      <label className="grid gap-1 text-xs text-sunu-ink/60">
        Spécialité
        <select
          disabled={locked}
          value={form.specialty_id}
          onChange={(e) => setForm({ ...form, specialty_id: e.target.value })}
          className={`${field} disabled:opacity-60`}
        >
          {(specs ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      {locked && (
        <p className="text-[11px] text-sunu-ink/50">
          Nom et spécialité ont été vérifiés sur vos justificatifs : pour les modifier, écrivez à
          l'équipe Fajma avec le document correspondant.
        </p>
      )}
      <label className="grid gap-1 text-xs text-sunu-ink/60">
        Présentation (visible par les patients)
        <textarea
          rows={4}
          maxLength={1000}
          value={form.bio}
          onChange={(e) => setForm({ ...form, bio: e.target.value })}
          placeholder="Parcours, domaines d'intérêt, façon de travailler…"
          className={field}
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="grid gap-1 text-xs text-sunu-ink/60">
          Tarif de base (FCFA)
          <input
            type="number"
            min={0}
            step={500}
            value={form.consultation_price}
            onChange={(e) => setForm({ ...form, consultation_price: Number(e.target.value) || 0 })}
            className={field}
          />
        </label>
        <label className="grid gap-1 text-xs text-sunu-ink/60">
          Années d'expérience
          <input
            type="number"
            min={0}
            max={70}
            value={form.years_experience}
            onChange={(e) => setForm({ ...form, years_experience: Number(e.target.value) || 0 })}
            className={field}
          />
        </label>
      </div>
      <p className="-mt-1 text-[11px] text-sunu-ink/50">
        Un nouveau tarif ne change pas le prix des rendez-vous déjà pris. Les tarifs par motif se
        règlent dans « Motifs de consultation ».
      </p>
      <fieldset className="grid gap-1">
        <legend className="mb-1 text-xs text-sunu-ink/60">Langues parlées</legend>
        <div className="flex flex-wrap gap-1.5">
          {DOCTOR_LANGUAGES.map((l) => (
            <button
              type="button"
              key={l}
              onClick={() => toggleLang(l)}
              aria-pressed={form.languages.includes(l)}
              className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${form.languages.includes(l) ? "border-sunu-green bg-sunu-green text-white" : "border-sunu-line text-sunu-ink/70"}`}
            >
              {l}
            </button>
          ))}
        </div>
      </fieldset>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={form.teleconsultation}
          onChange={(e) => setForm({ ...form, teleconsultation: e.target.checked })}
          className="size-4 accent-sunu-green"
        />
        Je propose la téléconsultation (vidéo)
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="grid gap-1 text-xs text-sunu-ink/60">
          Ville
          <input
            required
            value={form.city}
            onChange={(e) => setForm({ ...form, city: e.target.value })}
            className={field}
          />
        </label>
        <label className="grid gap-1 text-xs text-sunu-ink/60">
          Adresse du cabinet
          <input
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            placeholder="Rue, quartier"
            className={field}
          />
        </label>
      </div>
      <button
        disabled={save.isPending}
        className="rounded-lg bg-sunu-green px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
      >
        Enregistrer ma fiche
      </button>
    </form>
  );
}
