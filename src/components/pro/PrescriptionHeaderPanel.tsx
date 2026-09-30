/**
 * Espace médecin : mentions portées sur les ordonnances et certificats (n° d'Ordre, établissement,
 * téléphone), signature (dessinée au doigt / à la souris ou photo) et cachet. Sans n° d'Ordre ni
 * signature, le serveur refuse de délivrer une ordonnance.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Eraser, FileSignature, Loader2, ShieldAlert, Stamp, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import {
  getPrescriptionHeader,
  savePrescriptionHeader,
  savePrescriptionImage,
  type PrescriptionHeader,
} from "@/api/doctor";
import { fileToBase64 } from "@/lib/file-base64";

const KEY = ["pro-prescription-header"];
const IMAGE_FILES = "image/png,image/jpeg";
const input = "w-full rounded-lg border border-sunu-line bg-sunu-card px-3 py-2 text-sm";

export function PrescriptionHeaderPanel() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: KEY, queryFn: getPrescriptionHeader });
  const [form, setForm] = useState<Omit<PrescriptionHeader, "signature" | "stamp" | "missing">>();
  useEffect(() => {
    if (data && !form) {
      const { signature: _s, stamp: _t, missing: _m, ...rest } = data;
      setForm(rest);
    }
  }, [data, form]);

  const save = useMutation({
    mutationFn: () => savePrescriptionHeader(form!),
    onSuccess: (res) => {
      qc.setQueryData(KEY, res);
      toast.success("En-tête des ordonnances enregistré");
    },
    onError: (e) => toast.error(e.message),
  });
  const image = useMutation({
    mutationFn: (v: { kind: "signature" | "stamp"; base64: string }) =>
      savePrescriptionImage(v.kind, v.base64),
    onSuccess: (res, v) => {
      qc.setQueryData(KEY, res);
      const done = {
        signature: v.base64 ? "Signature enregistrée" : "Signature retirée",
        stamp: v.base64 ? "Cachet enregistré" : "Cachet retiré",
      };
      toast.success(done[v.kind === "signature" ? "signature" : "stamp"]);
    },
    onError: (e) => toast.error(e.message),
  });

  if (!data || !form) return null;
  const field = (key: keyof typeof form, label: string, placeholder = "", required = false) => (
    <label className="block text-xs font-semibold text-sunu-ink/60">
      {label}
      {required && <span className="text-red-600"> *</span>}
      <input
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        placeholder={placeholder}
        className={`mt-1 ${input} font-normal text-sunu-dark`}
      />
    </label>
  );

  return (
    <section
      id="entete-ordonnances"
      aria-label="En-tête des ordonnances"
      className="scroll-mt-6 rounded-2xl border border-sunu-line bg-sunu-card p-5"
    >
      <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-sunu-ink/50">
        <FileSignature className="size-4" /> Ordonnances : en-tête et signature
      </h2>
      {data.missing.length > 0 && (
        <p className="mt-2 flex gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <ShieldAlert className="size-4 shrink-0" />
          Pour délivrer des ordonnances et certificats, complétez : {data.missing.join(", ")}.
        </p>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
        className="mt-3 space-y-2"
      >
        {field("order_number", "N° d'inscription à l'Ordre des médecins", "Ex. 1234", true)}
        {field(
          "professional_title",
          "Titres et qualifications",
          "Ex. Ancien interne des hôpitaux de Dakar",
        )}
        {field("practice_name", "Cabinet / établissement", "Ex. Cabinet médical Point E")}
        {field("address", "Adresse", "Rue, quartier")}
        <div className="grid grid-cols-2 gap-2">
          {field("city", "Ville", "", true)}
          {field("practice_phone", "Téléphone du cabinet", "33 800 00 00")}
        </div>
        <p className="text-[11px] text-sunu-ink/50">
          Pour un rendez-vous dans un de vos lieux de consultation, l'ordonnance porte l'adresse de
          ce lieu. Les ordonnances déjà délivrées ne changent pas.
        </p>
        <button
          disabled={save.isPending}
          className="rounded-lg bg-sunu-green px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
        >
          Enregistrer
        </button>
      </form>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <SignaturePad
          current={data.signature}
          busy={image.isPending}
          onSave={(base64) => image.mutate({ kind: "signature", base64 })}
        />
        <ImageSlot
          icon={<Stamp className="size-3.5" />}
          label="Cachet (photo, fond blanc)"
          current={data.stamp}
          busy={image.isPending}
          onSave={(base64) => image.mutate({ kind: "stamp", base64 })}
        />
      </div>
    </section>
  );
}

/** Zone de signature au doigt ou à la souris, ou import d'une photo de signature. */
function SignaturePad({
  current,
  busy,
  onSave,
}: {
  current: string | null;
  busy: boolean;
  onSave: (base64: string) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<number[]>([0, 0]);
  // Longueur du tracé : un point ou un trait minuscule n'est pas une signature.
  const ink = useRef(0);
  const [empty, setEmpty] = useState(true);
  const [editing, setEditing] = useState(!current);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvas.current!;
    const r = c.getBoundingClientRect();
    return [
      ((e.clientX - r.left) * c.width) / r.width,
      ((e.clientY - r.top) * c.height) / r.height,
    ];
  };
  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const ctx = canvas.current!.getContext("2d")!;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0b1f3a"; // encre bleu-noir, comme un stylo
    const [x, y] = point(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    last.current = [x, y];
    drawing.current = true;
    canvas.current!.setPointerCapture(e.pointerId);
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = canvas.current!.getContext("2d")!;
    const [x, y] = point(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    ink.current += Math.hypot(x - last.current[0]!, y - last.current[1]!);
    last.current = [x, y];
    if (ink.current > 150) setEmpty(false);
  };
  const clear = () => {
    const c = canvas.current;
    c?.getContext("2d")?.clearRect(0, 0, c.width, c.height);
    ink.current = 0;
    setEmpty(true);
  };

  return (
    <div>
      <p className="flex items-center gap-1.5 text-xs font-semibold text-sunu-ink/60">
        <FileSignature className="size-3.5" /> Signature <span className="text-red-600">*</span>
      </p>
      {current && !editing ? (
        <>
          <img
            src={current}
            alt="Votre signature"
            className="mt-1 h-28 w-full rounded-lg border border-sunu-line object-contain p-2"
            style={{ background: "#fff" }}
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-lg border border-sunu-line px-3 py-1.5 text-xs font-semibold text-sunu-ink/70"
            >
              Changer
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onSave("")}
              className="flex items-center gap-1 rounded-lg border border-sunu-line px-3 py-1.5 text-xs font-semibold text-sunu-ink/70 hover:text-red-600"
            >
              <Trash2 className="size-3.5" /> Retirer
            </button>
          </div>
        </>
      ) : (
        <>
          <canvas
            ref={canvas}
            width={600}
            height={220}
            onPointerDown={start}
            onPointerMove={move}
            onPointerUp={() => (drawing.current = false)}
            onPointerLeave={() => (drawing.current = false)}
            aria-label="Signez ici avec le doigt ou la souris"
            className="mt-1 h-28 w-full cursor-crosshair touch-none rounded-lg border border-dashed border-sunu-line"
            style={{ background: "#fff" }}
          />
          <p className="mt-1 text-[11px] text-sunu-ink/50">
            Signez dans le cadre avec le doigt ou la souris ; « Enregistrer » s'active une fois la
            signature tracée.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={empty || busy}
              onClick={() => {
                onSave(canvas.current!.toDataURL("image/png").split(",")[1]);
                setEditing(false);
                clear();
              }}
              className="flex items-center gap-1 rounded-lg bg-sunu-green px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              {busy && <Loader2 className="size-3.5 animate-spin" />} Enregistrer
            </button>
            <button
              type="button"
              onClick={clear}
              className="flex items-center gap-1 rounded-lg border border-sunu-line px-3 py-1.5 text-xs font-semibold text-sunu-ink/70"
            >
              <Eraser className="size-3.5" /> Effacer
            </button>
            <FileButton
              label="Photo"
              onFile={async (file) => {
                onSave(await fileToBase64(file));
                setEditing(false);
              }}
            />
            {current && (
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="text-xs font-semibold text-sunu-ink/50"
              >
                Annuler
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function ImageSlot({
  icon,
  label,
  current,
  busy,
  onSave,
}: {
  icon: React.ReactNode;
  label: string;
  current: string | null;
  busy: boolean;
  onSave: (base64: string) => void;
}) {
  return (
    <div>
      <p className="flex items-center gap-1.5 text-xs font-semibold text-sunu-ink/60">
        {icon} {label}
      </p>
      <div
        className="mt-1 grid h-28 place-items-center rounded-lg border border-dashed border-sunu-line p-2"
        style={{ background: "#fff" }}
      >
        {current ? (
          <img src={current} alt={label} className="max-h-full max-w-full object-contain" />
        ) : (
          <span className="text-xs text-gray-600">Aucun cachet</span>
        )}
      </div>
      <div className="mt-2 flex gap-2">
        <FileButton
          label={current ? "Remplacer" : "Importer"}
          onFile={async (f) => onSave(await fileToBase64(f))}
        />
        {current && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onSave("")}
            className="flex items-center gap-1 rounded-lg border border-sunu-line px-3 py-1.5 text-xs font-semibold text-sunu-ink/70 hover:text-red-600"
          >
            <Trash2 className="size-3.5" /> Retirer
          </button>
        )}
      </div>
    </div>
  );
}

function FileButton({ label, onFile }: { label: string; onFile: (file: File) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.click()}
        className="flex items-center gap-1 rounded-lg border border-sunu-line px-3 py-1.5 text-xs font-semibold text-sunu-ink/70"
      >
        <Upload className="size-3.5" /> {label}
      </button>
      <input
        ref={ref}
        type="file"
        accept={IMAGE_FILES}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            if (file.size > 1_000_000) toast.error("Image trop lourde (1 Mo au plus)");
            else onFile(file);
          }
          e.target.value = "";
        }}
      />
    </>
  );
}
