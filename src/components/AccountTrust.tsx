/** Confiance du compte : vérification du numéro de téléphone et historique des accès au dossier. */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { BadgeCheck, Eye, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { getMyAccessLog, meQueryKey, requestOtp, useMe, verifyOtp } from "@/api/auth";
import { formatDateTime } from "@/lib/datetime";

export function PhoneVerification() {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!me) return null;

  if (me.phone_verified) {
    return (
      <p className="flex items-center gap-1.5 text-xs font-semibold text-sunu-teal">
        <BadgeCheck className="size-4" /> Numéro vérifié : {me.phone}
      </p>
    );
  }
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
      <p className="flex items-center gap-1.5 font-semibold">
        <Smartphone className="size-4" /> Vérifiez votre numéro pour recevoir vos rappels et vous
        connecter par SMS.
      </p>
      <div className="mt-2 flex gap-2">
        {!sent ? (
          <>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder={me.phone ?? "77 123 45 67"}
              aria-label="Numéro à vérifier"
              className="min-w-0 flex-1 rounded-lg border border-amber-200 bg-sunu-card px-2 py-1.5 text-sm"
            />
            <button
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const res = await requestOtp(phone || me.phone || "");
                  setPhone(res.phone);
                  setSent(true);
                  if (res.dev_code)
                    toast.info(`Code de test : ${res.dev_code}`, { duration: 20000 });
                })
              }
              className="rounded-lg bg-amber-600 px-3 py-1.5 font-semibold text-white disabled:opacity-50"
            >
              Recevoir un code
            </button>
          </>
        ) : (
          <>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              maxLength={6}
              inputMode="numeric"
              placeholder="Code reçu"
              aria-label="Code reçu par SMS"
              className="w-28 rounded-lg border border-amber-200 bg-sunu-card px-2 py-1.5 text-center text-sm tracking-widest"
            />
            <button
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await verifyOtp({ phone, code });
                  await qc.invalidateQueries({ queryKey: meQueryKey });
                  await qc.invalidateQueries({ queryKey: ["my-health-data"] });
                  toast.success("Numéro vérifié");
                })
              }
              className="rounded-lg bg-amber-600 px-3 py-1.5 font-semibold text-white disabled:opacity-50"
            >
              Vérifier
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export function AccessLogSection() {
  const { data } = useQuery({ queryKey: ["access-log"], queryFn: getMyAccessLog });
  return (
    <section>
      <h2 className="mb-1 flex items-center gap-2 text-lg font-bold text-sunu-dark">
        <Eye className="size-5 text-sunu-green" /> Qui a consulté mon dossier
      </h2>
      <p className="mb-3 text-xs text-sunu-ink/55">
        Chaque consultation de votre dossier par un professionnel est enregistrée.
      </p>
      <div className="rounded-xl border border-sunu-line bg-sunu-card p-5">
        {(data ?? []).length === 0 ? (
          <p className="text-sm text-sunu-ink/50">Aucun accès à votre dossier pour le moment.</p>
        ) : (
          <ul className="divide-y divide-sunu-line text-sm">
            {data!.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <b className="text-sunu-dark">{e.who}</b>{" "}
                  <span className="text-sunu-ink/60">· {e.action}</span>
                </span>
                <time className="text-xs text-sunu-ink/50">
                  {formatDateTime(e.at, { dateStyle: "short", timeStyle: "short" })}
                </time>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
