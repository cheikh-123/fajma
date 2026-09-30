/** Icône d'une spécialité : le serveur envoie un nom d'icône (« Heart », « Baby »…), dessiné ici. */
import {
  Baby,
  Bone,
  Brain,
  Ear,
  Eye,
  Heart,
  Smile,
  Sparkles,
  Stethoscope,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  Baby,
  Bone,
  Brain,
  Ear,
  Eye,
  Heart,
  Smile,
  Sparkles,
  Stethoscope,
};

export function SpecialtyIcon({
  name,
  className = "size-5",
}: {
  name?: string | null;
  className?: string;
}) {
  const Icon = (name && ICONS[name]) || Stethoscope;
  return <Icon className={className} aria-hidden />;
}
