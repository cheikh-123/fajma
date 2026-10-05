/**
 * Courbe des mesures chargée à la demande : la bibliothèque de graphiques (lourde) n'est téléchargée
 * que lorsqu'une courbe s'affiche, pas à l'ouverture du dossier.
 */
import { lazy, Suspense, type ComponentProps } from "react";

const Chart = lazy(() =>
  import("./MeasurementsChart").then((m) => ({ default: m.MeasurementsChart })),
);

export function LazyMeasurementsChart(props: ComponentProps<typeof Chart>) {
  return (
    <Suspense fallback={<div className="h-56 w-full animate-pulse rounded-lg bg-sunu-surface" />}>
      <Chart {...props} />
    </Suspense>
  );
}
