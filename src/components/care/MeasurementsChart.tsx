/** Courbe des mesures (tension : deux séries, glycémie ou poids : une série), avec seuils de repère. */
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Measurement, MeasurementKind } from "@/api/care";
import { formatDate, formatDateTime } from "@/lib/datetime";

const UNIT: Record<MeasurementKind, string> = {
  blood_pressure: "mmHg",
  glucose: "g/L",
  weight: "kg",
};

export function MeasurementsChart({
  items,
  kind,
}: {
  items: Measurement[];
  kind: MeasurementKind;
}) {
  const points = items
    .filter((m) => m.kind === kind)
    .slice()
    .reverse()
    .map((m) => ({
      t: new Date(m.measured_at).getTime(),
      sys: m.systolic,
      dia: m.diastolic,
      value: m.value,
    }));
  if (points.length < 2) {
    return (
      <p className="rounded-lg bg-sunu-surface px-3 py-6 text-center text-xs text-sunu-ink/50">
        La courbe apparaît à partir de 2 mesures.
      </p>
    );
  }
  const axis = { fontSize: 11, fill: "var(--sunu-ink)", opacity: 0.6 };
  return (
    <div className="h-56 w-full" role="img" aria-label={`Évolution : ${UNIT[kind]}`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
          <CartesianGrid stroke="var(--sunu-line)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(t: number) => formatDate(t, { day: "numeric", month: "short" })}
            tick={axis}
            stroke="var(--sunu-line)"
          />
          <YAxis
            tick={axis}
            stroke="var(--sunu-line)"
            domain={["auto", "auto"]}
            unit=""
            width={48}
          />
          <Tooltip
            labelFormatter={(t) =>
              formatDateTime(Number(t), {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })
            }
            formatter={(v, name) => [`${v} ${UNIT[kind]}`, name]}
            contentStyle={{
              background: "var(--sunu-card)",
              border: "1px solid var(--sunu-line)",
              borderRadius: 8,
              fontSize: 12,
              color: "var(--sunu-ink)",
            }}
          />
          {kind === "blood_pressure" ? (
            <>
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <ReferenceLine
                y={140}
                stroke="var(--sunu-ink)"
                strokeOpacity={0.35}
                strokeDasharray="4 4"
              />
              <ReferenceLine
                y={90}
                stroke="var(--sunu-ink)"
                strokeOpacity={0.35}
                strokeDasharray="4 4"
              />
              <Line
                name="Systolique (haut)"
                dataKey="sys"
                stroke="var(--chart-1)"
                strokeWidth={2}
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
              />
              <Line
                name="Diastolique (bas)"
                dataKey="dia"
                stroke="var(--chart-2)"
                strokeWidth={2}
                strokeDasharray="6 3"
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
              />
            </>
          ) : (
            <>
              {kind === "glucose" && (
                <ReferenceLine
                  y={1.26}
                  stroke="var(--sunu-ink)"
                  strokeOpacity={0.35}
                  strokeDasharray="4 4"
                />
              )}
              <Line
                name={kind === "glucose" ? "Glycémie" : "Poids"}
                dataKey="value"
                stroke="var(--chart-1)"
                strokeWidth={2}
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
              />
            </>
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
