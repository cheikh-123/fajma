import { createFileRoute, Link } from "@tanstack/react-router";
import { ThemeToggle } from "@/lib/theme";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { ArrowLeft, Heart, MapPin, Star, Video } from "lucide-react";
import { listDoctors, listSpecialties } from "@/api/directory";
import { SpecialtyIcon } from "@/components/SpecialtyIcon";

const qo = (slug: string) =>
  queryOptions({
    queryKey: ["specialty-page", slug],
    queryFn: async () => {
      const [specialties, doctors] = await Promise.all([
        listSpecialties(),
        listDoctors({ data: { specialty: slug } }),
      ]);
      return { specialty: specialties.find((s) => s.slug === slug) ?? null, doctors };
    },
  });

export const Route = createFileRoute("/specialites/$slug")({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(qo(params.slug)),
  head: ({ loaderData, params }) => {
    const name = loaderData?.specialty?.name ?? params.slug;
    return {
      meta: [
        { title: `${name} au Sénégal — prendre rendez-vous | Fajma` },
        {
          name: "description",
          content: `Trouvez un praticien en ${name} vérifié à Dakar, Thiès ou Saint-Louis et réservez votre consultation ou téléconsultation en ligne.`,
        },
        { property: "og:title", content: `${name} — Fajma` },
        {
          property: "og:description",
          content: `${loaderData?.doctors.length ?? 0} praticien(s) en ${name} disponibles sur Fajma.`,
        },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  errorComponent: () => (
    <p className="p-10 text-center text-sm">Impossible de charger cette spécialité.</p>
  ),
  notFoundComponent: () => <p className="p-10 text-center text-sm">Spécialité introuvable.</p>,
  component: SpecialtyPage,
});

function SpecialtyPage() {
  const { slug } = Route.useParams();
  const { data } = useSuspenseQuery(qo(slug));
  const name = data.specialty?.name ?? slug;
  return (
    <div className="min-h-screen bg-sunu-surface">
      <header className="border-b border-sunu-line bg-sunu-card">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <Link to="/" className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-lg bg-sunu-green text-white">
              <Heart className="size-4" strokeWidth={2.5} />
            </span>
            <span className="text-xl font-bold text-sunu-green">Fajma</span>
          </Link>
          <ThemeToggle className="ml-auto mr-3" />
          <Link
            to="/specialites"
            className="flex items-center gap-1 text-sm font-medium text-sunu-ink/60 hover:text-sunu-green"
          >
            <ArrowLeft className="size-4" /> Spécialités
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-10">
        <p className="text-xs font-bold uppercase tracking-widest text-sunu-green">Spécialité</p>
        <h1 className="mt-1 flex items-center gap-3 text-3xl font-bold text-sunu-dark">
          <span className="grid size-11 place-items-center rounded-xl bg-sunu-green-soft text-sunu-green">
            <SpecialtyIcon name={data.specialty?.icon} className="size-6" />
          </span>
          {name}
        </h1>
        {data.specialty?.description && (
          <p className="mt-2 max-w-2xl text-sm text-sunu-ink/60">{data.specialty.description}</p>
        )}
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {data.doctors.map((d) => (
            <Link
              key={d.id}
              to="/medecins/$id"
              params={{ id: d.id }}
              className="rounded-2xl border border-sunu-line bg-sunu-card p-5 transition-shadow hover:shadow-sunu-card"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-bold text-sunu-dark">{d.full_name}</h2>
                  <p className="text-sm font-semibold text-sunu-green">{d.specialty?.name}</p>
                  <p className="mt-1 flex items-center gap-1 text-sm text-sunu-ink/60">
                    <MapPin className="size-3.5" /> {d.city}
                  </p>
                </div>
                {d.reviews_count > 0 ? (
                  <span className="flex items-center gap-1 text-sm font-semibold text-sunu-dark">
                    <Star className="size-4 fill-amber-400 text-amber-400" />
                    {d.rating}
                    <span className="font-normal text-sunu-ink/50">({d.reviews_count})</span>
                  </span>
                ) : (
                  <span className="text-xs text-sunu-ink/50">Nouveau</span>
                )}
              </div>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-sm font-bold text-sunu-dark">
                  {d.consultation_price.toLocaleString("fr-FR")} FCFA
                </span>
                {d.teleconsultation && (
                  <span className="flex items-center gap-1 rounded-full bg-sunu-teal/10 px-2 py-0.5 text-xs font-semibold text-sunu-teal">
                    <Video className="size-3" /> Téléconsultation
                  </span>
                )}
              </div>
            </Link>
          ))}
          {!data.doctors.length && (
            <p className="text-sm text-sunu-ink/60">
              Aucun praticien inscrit dans cette spécialité pour le moment.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
