import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { ArrowLeft, Building2, CalendarClock, Heart, MapPin, Phone } from "lucide-react";
import { getPublicClinic } from "@/api/directory";
import { LanguageSwitcher } from "@/lib/i18n";
import { ThemeToggle } from "@/lib/theme";

const clinicQO = (id: string) =>
  queryOptions({ queryKey: ["public-clinic", id], queryFn: () => getPublicClinic(id) });

export const Route = createFileRoute("/cliniques/$id")({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(clinicQO(params.id)),
  head: ({ loaderData }) => ({
    meta: [
      { title: loaderData ? `${loaderData.name} — Fajma` : "Établissement — Fajma" },
      {
        name: "description",
        content: loaderData
          ? `Médecins de ${loaderData.name} (${loaderData.city}) : prenez rendez-vous en ligne.`
          : "Établissement de santé.",
      },
    ],
  }),
  component: ClinicPage,
});

function ClinicPage() {
  const { id } = Route.useParams();
  const { data: clinic } = useSuspenseQuery(clinicQO(id));
  return (
    <div className="min-h-screen bg-sunu-surface">
      <header className="border-b border-sunu-line bg-sunu-card">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-lg bg-sunu-green text-white">
              <Heart className="size-4" strokeWidth={2.5} />
            </span>
            <span className="text-xl font-bold text-sunu-green">Fajma</span>
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <ThemeToggle />
            <LanguageSwitcher />
            <Link
              to="/cliniques"
              className="flex items-center gap-1 text-sm font-medium text-sunu-ink/60 hover:text-sunu-green"
            >
              <ArrowLeft className="size-4" />{" "}
              <span className="hidden sm:inline">Établissements</span>
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="rounded-2xl border border-sunu-line bg-sunu-card p-6">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-sunu-dark">
            <Building2 className="size-6 text-sunu-green" /> {clinic.name}
          </h1>
          <p className="mt-2 flex items-center gap-1.5 text-sm text-sunu-ink/60">
            <MapPin className="size-4" /> {clinic.address ? `${clinic.address}, ` : ""}
            {clinic.city}
          </p>
          {clinic.phone && (
            <a
              href={`tel:${clinic.phone.replace(/\s/g, "")}`}
              className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold text-sunu-green"
            >
              <Phone className="size-4" /> {clinic.phone}
            </a>
          )}
          {clinic.description && (
            <p className="mt-4 whitespace-pre-wrap text-sm text-sunu-ink/80">
              {clinic.description}
            </p>
          )}
        </div>
        <h2 className="mt-8 text-sm font-bold uppercase tracking-wider text-sunu-ink/50">
          Médecins ({clinic.doctors?.length ?? 0})
        </h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {(clinic.doctors ?? []).map((d) => (
            <Link
              key={d.id}
              to="/medecins/$id"
              params={{ id: d.id }}
              className="flex items-center gap-3 rounded-2xl border border-sunu-line bg-sunu-card p-4 hover:border-sunu-green"
            >
              {d.avatar_url ? (
                <img src={d.avatar_url} alt="" className="size-12 rounded-full object-cover" />
              ) : (
                <span className="grid size-12 place-items-center rounded-full bg-sunu-green-soft font-bold text-sunu-green">
                  {d.full_name.split(" ").slice(-1)[0]?.[0]}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="font-bold text-sunu-dark">{d.full_name}</p>
                <p className="text-sm text-sunu-green">{d.specialty?.name}</p>
                {d.next_slot && (
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-sunu-ink/60">
                    <CalendarClock className="size-3.5" /> Prochain créneau : {d.next_slot.label}
                  </p>
                )}
              </div>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
