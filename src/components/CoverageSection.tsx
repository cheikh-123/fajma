/** Dossier patient : assurances et mutuelles (pour soi ou pour un proche). */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2, Pencil, ShieldPlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  addCoverage,
  deleteCoverage,
  listInsurers,
  listMyCoverages,
  updateCoverage,
} from "@/api/insurance";
import { listMyRelatives } from "@/api/patient";
import { formatDate } from "@/lib/datetime";
import { useI18n } from "@/lib/i18n";

const input =
  "rounded-lg border border-sunu-line bg-sunu-card px-3 py-2 text-sm font-normal text-sunu-ink";

export function CoverageSection() {
  const qc = useQueryClient();
  const { t } = useI18n();
  const { data: coverages } = useQuery({ queryKey: ["my-coverages"], queryFn: listMyCoverages });
  const { data: insurers } = useQuery({ queryKey: ["insurers"], queryFn: listInsurers });
  const { data: relatives } = useQuery({
    queryKey: ["my-relatives"],
    queryFn: () => listMyRelatives(),
  });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    insurer_id: "",
    member_number: "",
    coverage_percent: "",
    valid_until: "",
    relative_id: "",
  });
  // Couverture en cours de correction : organisme et bénéficiaire ne changent pas (on supprime et on recrée).
  const [editingId, setEditingId] = useState<string | null>(null);
  const set = (patch: Partial<typeof form>) => setForm({ ...form, ...patch });
  const refresh = () => qc.invalidateQueries({ queryKey: ["my-coverages"] });

  const add = useMutation({
    mutationFn: () =>
      editingId
        ? updateCoverage({
            id: editingId,
            member_number: form.member_number,
            coverage_percent: Number(form.coverage_percent),
            valid_until: form.valid_until || undefined,
          })
        : addCoverage({
            data: {
              insurer_id: form.insurer_id,
              member_number: form.member_number,
              coverage_percent: Number(form.coverage_percent),
              valid_until: form.valid_until || undefined,
              relative_id: form.relative_id || undefined,
            },
          }),
    onSuccess: () => {
      toast.success("Assurance enregistrée");
      setOpen(false);
      setEditingId(null);
      setForm({
        insurer_id: "",
        member_number: "",
        coverage_percent: "",
        valid_until: "",
        relative_id: "",
      });
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: deleteCoverage,
    onSuccess: refresh,
    onError: (e) => toast.error(e.message),
  });

  return (
    <section>
      <h2 className="mb-1 flex items-center gap-2 text-lg font-bold text-sunu-dark">
        <ShieldPlus className="size-5 text-sunu-teal" /> {t("dossier.coverage")}
      </h2>
      <p className="mb-3 text-xs text-sunu-ink/55">{t("dossier.coverageIntro")}</p>
      <div className="rounded-xl border border-sunu-line bg-sunu-card p-5">
        {(coverages ?? []).length === 0 && !open && (
          <p className="text-sm text-sunu-ink/55">Aucune assurance enregistrée.</p>
        )}
        <ul className="divide-y divide-sunu-line">
          {(coverages ?? []).map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <div>
                <p className="font-semibold text-sunu-dark">
                  {c.insurer.name} · {c.coverage_percent} %
                </p>
                <p className="text-xs text-sunu-ink/55">
                  N° {c.member_number} · {c.relative ? c.relative.full_name : "Moi"}
                  {c.valid_until && ` · valable jusqu'au ${formatDate(c.valid_until)}`}
                </p>
              </div>
              <span className="flex shrink-0 items-center gap-2">
                <button
                  onClick={() => {
                    setEditingId(c.id);
                    setForm({
                      insurer_id: c.insurer.id,
                      member_number: c.member_number,
                      coverage_percent: String(c.coverage_percent),
                      valid_until: c.valid_until ?? "",
                      relative_id: c.relative?.id ?? "",
                    });
                    setOpen(true);
                  }}
                  aria-label="Modifier"
                  className="text-sunu-ink/40 hover:text-sunu-teal"
                >
                  <Pencil className="size-4" />
                </button>
                <button
                  onClick={() => remove.mutate(c.id)}
                  aria-label="Supprimer"
                  className="text-sunu-ink/40 hover:text-red-600"
                >
                  <Trash2 className="size-4" />
                </button>
              </span>
            </li>
          ))}
        </ul>

        {open ? (
          <form
            className="mt-3 grid gap-3 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              add.mutate();
            }}
          >
            <label className="grid gap-1 text-xs font-semibold text-sunu-ink/60">
              Organisme
              <select
                required
                disabled={Boolean(editingId)}
                value={form.insurer_id}
                onChange={(e) => {
                  const ins = insurers?.find((i) => i.id === e.target.value);
                  set({
                    insurer_id: e.target.value,
                    coverage_percent: ins ? String(ins.default_coverage_percent) : "",
                  });
                }}
                className={input}
              >
                <option value="">Choisir…</option>
                {(insurers ?? []).map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs font-semibold text-sunu-ink/60">
              Numéro d'adhérent
              <input
                required
                minLength={2}
                maxLength={40}
                value={form.member_number}
                onChange={(e) => set({ member_number: e.target.value })}
                className={input}
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-sunu-ink/60">
              Taux de prise en charge (%)
              <input
                required
                type="number"
                min={0}
                max={100}
                value={form.coverage_percent}
                onChange={(e) => set({ coverage_percent: e.target.value })}
                className={input}
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-sunu-ink/60">
              Valable jusqu'au (facultatif)
              <input
                type="date"
                value={form.valid_until}
                onChange={(e) => set({ valid_until: e.target.value })}
                className={input}
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-sunu-ink/60 sm:col-span-2">
              Pour
              <select
                disabled={Boolean(editingId)}
                value={form.relative_id}
                onChange={(e) => set({ relative_id: e.target.value })}
                className={input}
              >
                <option value="">Moi</option>
                {(relatives ?? []).map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.full_name}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex gap-2 sm:col-span-2">
              <button
                type="submit"
                disabled={add.isPending}
                className="flex items-center gap-1.5 rounded-lg bg-sunu-teal px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {add.isPending && <Loader2 className="size-4 animate-spin" />} Enregistrer
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setEditingId(null);
                  setForm({
                    insurer_id: "",
                    member_number: "",
                    coverage_percent: "",
                    valid_until: "",
                    relative_id: "",
                  });
                }}
                className="rounded-lg border border-sunu-line px-4 py-2 text-sm"
              >
                Annuler
              </button>
            </div>
          </form>
        ) : (
          <button
            onClick={() => setOpen(true)}
            className="mt-3 text-sm font-semibold text-sunu-teal hover:underline"
          >
            + Ajouter une assurance
          </button>
        )}
      </div>
    </section>
  );
}
