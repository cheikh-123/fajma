/** Nouveau RDV saisi par le médecin : patient au téléphone ou au cabinet, avec ou sans compte Fajma. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2, UserRound, X } from "lucide-react";
import { toast } from "sonner";
import {
  createDeskAppointment,
  listKnownPatients,
  listMyConsultationTypes,
  type KnownPatient,
} from "@/api/doctor";
import { listDoctorSlots } from "@/api/directory";
import type { DoctorProfile } from "@/api/types";
import { fromDakarInput, toDakarInput } from "@/lib/datetime";

export function NewAppointmentForm({
  profile,
  onDone,
}: {
  profile: DoctorProfile;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const [picked, setPicked] = useState<KnownPatient | null>(null);
  const [form, setForm] = useState({
    patient_name: "",
    patient_phone: "",
    when: "",
    duration_minutes: 30,
    mode: "in_person" as "in_person" | "teleconsultation" | "home_visit",
    consultation_type_id: "",
    reason: "",
    visit_address: "",
    visit_landmark: "",
  });
  const home = form.mode === "home_visit";
  const { data: suggestions, isFetching } = useQuery({
    queryKey: ["known-patients", form.patient_name],
    queryFn: () => listKnownPatients(form.patient_name),
    enabled: !picked && form.patient_name.trim().length >= 2,
  });
  const { data: types } = useQuery({
    queryKey: ["my-consultation-types"],
    queryFn: () => listMyConsultationTypes(),
  });
  const { data: slots } = useQuery({
    queryKey: ["doctor-slots", profile.id, form.duration_minutes, "desk", home],
    queryFn: () =>
      listDoctorSlots({
        data: {
          doctor_id: profile.id,
          days: 7,
          duration_minutes: form.duration_minutes,
          mode: home ? "home_visit" : undefined,
        },
      }),
  });
  const create = useMutation({
    mutationFn: () =>
      createDeskAppointment({
        scheduled_at: fromDakarInput(form.when).toISOString(),
        duration_minutes: form.duration_minutes,
        mode: form.mode,
        consultation_type_id: form.consultation_type_id || undefined,
        reason: form.reason || undefined,
        ...(picked?.patient_id
          ? { patient_id: picked.patient_id }
          : {
              patient_name: form.patient_name.trim(),
              patient_phone: form.patient_phone || undefined,
            }),
        ...(home
          ? { visit_address: form.visit_address, visit_landmark: form.visit_landmark || undefined }
          : {}),
      }),
    onSuccess: () => {
      toast.success(
        picked?.patient_id
          ? "Rendez-vous enregistré : le patient le voit dans son espace et reçoit ses rappels."
          : "Rendez-vous enregistré" + (form.patient_phone ? " : rappels SMS au patient." : "."),
      );
      qc.invalidateQueries({ queryKey: ["doctor-appointments"] });
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });
  const field = "w-full rounded-lg border border-sunu-line bg-sunu-card px-3 py-2 text-sm";
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!form.when) return toast.error("Choisissez un horaire");
        if (home && form.visit_address.trim().length < 5)
          return toast.error("Indiquez l'adresse de la visite");
        create.mutate();
      }}
      className="mb-4 grid gap-2 rounded-2xl border border-sunu-green bg-sunu-card p-4 text-sm"
    >
      <div className="flex items-center justify-between">
        <p className="font-bold text-sunu-dark">Nouveau rendez-vous</p>
        <button type="button" onClick={onDone} aria-label="Fermer" className="text-sunu-ink/50">
          <X className="size-4" />
        </button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="relative">
          <input
            required
            minLength={2}
            value={form.patient_name}
            onChange={(e) => {
              setPicked(null);
              setForm({ ...form, patient_name: e.target.value });
            }}
            placeholder="Nom du patient (ou recherche)"
            aria-label="Nom du patient"
            className={field}
          />
          {isFetching && (
            <Loader2 className="absolute right-2 top-2.5 size-4 animate-spin text-sunu-ink/40" />
          )}
          {!picked && (suggestions ?? []).length > 0 && (
            <ul className="absolute z-10 mt-1 w-full rounded-lg border border-sunu-line bg-sunu-card text-xs shadow">
              {(suggestions ?? []).slice(0, 6).map((s) => (
                <li key={`${s.patient_id}-${s.name}-${s.phone}`}>
                  <button
                    type="button"
                    onClick={() => {
                      setPicked(s);
                      setForm({ ...form, patient_name: s.name, patient_phone: s.phone ?? "" });
                    }}
                    className="flex w-full justify-between gap-2 px-3 py-1.5 text-left hover:bg-sunu-surface"
                  >
                    <span className="font-semibold">
                      {s.name}
                      {s.patient_id && <UserRound className="ml-1 inline size-3 text-sunu-teal" />}
                    </span>
                    <span className="text-sunu-ink/50">{s.phone ?? s.last_visit}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <input
          value={form.patient_phone}
          disabled={Boolean(picked?.patient_id)}
          onChange={(e) => setForm({ ...form, patient_phone: e.target.value })}
          placeholder="Téléphone (rappels SMS)"
          aria-label="Téléphone du patient"
          className={`${field} disabled:opacity-60`}
        />
      </div>
      {picked?.patient_id && (
        <p className="text-xs text-sunu-teal">
          Patient inscrit sur Fajma : le RDV apparaîtra dans son espace.{" "}
          <button type="button" onClick={() => setPicked(null)} className="font-semibold underline">
            Changer
          </button>
        </p>
      )}
      <div className="grid gap-2 sm:grid-cols-3">
        <select
          value={form.mode}
          onChange={(e) => setForm({ ...form, mode: e.target.value as typeof form.mode, when: "" })}
          aria-label="Type"
          className={field}
        >
          <option value="in_person">Au cabinet</option>
          {profile.teleconsultation && <option value="teleconsultation">Vidéo</option>}
          {profile.home_visits && <option value="home_visit">À domicile</option>}
        </select>
        <select
          value={form.consultation_type_id}
          onChange={(e) => {
            const type = types?.find((t) => t.id === e.target.value);
            setForm({
              ...form,
              consultation_type_id: e.target.value,
              duration_minutes: type?.duration_minutes ?? form.duration_minutes,
            });
          }}
          aria-label="Motif"
          className={field}
        >
          <option value="">Motif : consultation</option>
          {(types ?? [])
            .filter((t) => t.is_active)
            .map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.price.toLocaleString("fr-FR")} F)
              </option>
            ))}
        </select>
        <select
          value={form.duration_minutes}
          onChange={(e) => setForm({ ...form, duration_minutes: Number(e.target.value) })}
          aria-label="Durée"
          className={field}
        >
          {[10, 15, 20, 30, 45, 60, 90].map((n) => (
            <option key={n} value={n}>
              {n} min
            </option>
          ))}
        </select>
      </div>
      {(slots?.slots ?? []).length > 0 && (
        <div className="flex max-h-24 flex-wrap gap-1 overflow-y-auto">
          {(slots?.slots ?? []).slice(0, 24).map((s) => {
            const v = toDakarInput(s.iso);
            return (
              <button
                type="button"
                key={s.iso}
                onClick={() => setForm({ ...form, when: v })}
                className={`rounded-md border px-2 py-1 text-[11px] ${form.when === v ? "border-sunu-green bg-sunu-green text-white" : "border-sunu-line"}`}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      )}
      <input
        type="datetime-local"
        required
        value={form.when}
        onChange={(e) => setForm({ ...form, when: e.target.value })}
        aria-label="Horaire"
        className={field}
      />
      <p className="-mt-1 text-[11px] text-sunu-ink/50">
        Créneaux libres proposés ci-dessus, ou tout autre horaire (hors absences et sans chevaucher
        un autre rendez-vous).
      </p>
      {home && (
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            value={form.visit_address}
            onChange={(e) => setForm({ ...form, visit_address: e.target.value })}
            placeholder="Adresse de la visite"
            aria-label="Adresse de la visite"
            className={field}
          />
          <input
            value={form.visit_landmark}
            onChange={(e) => setForm({ ...form, visit_landmark: e.target.value })}
            placeholder="Repère"
            aria-label="Repère"
            className={field}
          />
        </div>
      )}
      <input
        value={form.reason}
        onChange={(e) => setForm({ ...form, reason: e.target.value })}
        placeholder="Motif noté (facultatif)"
        aria-label="Motif noté"
        className={field}
      />
      <button
        disabled={create.isPending}
        className="rounded-lg bg-sunu-green px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
      >
        Enregistrer le rendez-vous
      </button>
    </form>
  );
}
