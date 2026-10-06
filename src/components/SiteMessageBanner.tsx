/** Message en haut de toutes les pages (maintenance, information importante), réglé dans Administration > Système. */
import { useQuery } from "@tanstack/react-query";
import { Info } from "lucide-react";
import { getSiteInfo } from "@/api/backoffice";

export function SiteMessageBanner() {
  const { data } = useQuery({
    queryKey: ["site-info"],
    queryFn: getSiteInfo,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const message = data?.maintenance_message?.trim();
  if (!message) return null;
  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 bg-sunu-gold/90 px-4 py-2 text-center text-sm font-semibold text-sunu-dark"
    >
      <Info className="size-4 shrink-0" /> {message}
    </div>
  );
}
