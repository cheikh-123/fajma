import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { listMyNotifications, markNotificationsRead } from "@/api/patient";
import { formatDateTime } from "@/lib/datetime";

/** Cloche de notifications (nouveaux RDV, confirmations, annulations, messages). */
export function NotificationBell() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const { data } = useQuery({
    queryKey: ["notifications"],
    queryFn: listMyNotifications,
    refetchInterval: 120_000, // secours : les notifications arrivent en temps réel (use-live-events)
  });
  const markRead = useMutation({
    mutationFn: markNotificationsRead,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const unread = data?.unread ?? 0;
  const toggle = () => {
    setOpen((v) => !v);
    if (!open && unread > 0) markRead.mutate();
  };

  return (
    <div ref={box} className="relative">
      <button
        onClick={toggle}
        aria-label={unread ? `Notifications (${unread} non lues)` : "Notifications"}
        aria-expanded={open}
        className="relative grid size-9 place-items-center rounded-full text-sunu-ink/60 hover:bg-sunu-surface hover:text-sunu-green"
      >
        <Bell className="size-5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-sunu-line bg-sunu-card shadow-sunu-card">
          <p className="border-b border-sunu-line px-4 py-3 text-sm font-bold text-sunu-dark">
            Notifications
          </p>
          <div className="max-h-96 overflow-y-auto">
            {(data?.items ?? []).length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-sunu-ink/50">
                Aucune notification pour le moment.
              </p>
            ) : (
              data?.items.map((n) => {
                const content = (
                  <>
                    <p
                      className={`text-sm ${n.read ? "text-sunu-ink/70" : "font-semibold text-sunu-dark"}`}
                    >
                      {n.title}
                    </p>
                    {n.body && <p className="mt-0.5 text-xs text-sunu-ink/60">{n.body}</p>}
                    <p className="mt-1 text-[10px] text-sunu-ink/40">
                      {formatDateTime(n.created_at, { dateStyle: "short", timeStyle: "short" })}
                    </p>
                  </>
                );
                return n.link ? (
                  <Link
                    key={n.id}
                    to={n.link}
                    onClick={() => setOpen(false)}
                    className={`block border-b border-sunu-line px-4 py-3 last:border-0 hover:bg-sunu-surface ${n.read ? "" : "bg-sunu-green-soft/40"}`}
                  >
                    {content}
                  </Link>
                ) : (
                  <div key={n.id} className="border-b border-sunu-line px-4 py-3 last:border-0">
                    {content}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
