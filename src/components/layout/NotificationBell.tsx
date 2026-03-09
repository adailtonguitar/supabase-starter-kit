import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Bell, Check, CheckCheck, Info, AlertTriangle, AlertCircle, Wrench } from "lucide-react";
import { useNotifications, type AppNotification } from "@/hooks/useNotifications";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

const typeConfig: Record<string, { icon: typeof Info; color: string }> = {
  info: { icon: Info, color: "text-primary" },
  warning: { icon: AlertTriangle, color: "text-warning" },
  alert: { icon: AlertCircle, color: "text-destructive" },
  maintenance: { icon: Wrench, color: "text-muted-foreground" },
};

export function NotificationBell() {
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="relative flex items-center justify-center w-7 h-7 rounded-md hover:bg-muted transition-colors"
        aria-label="Notificações"
      >
        <Bell className="w-4 h-4 text-muted-foreground" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-80 bg-popover border border-border rounded-xl shadow-2xl z-[9999] overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
            <span className="text-sm font-semibold text-foreground">Notificações</span>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                <CheckCheck className="w-3 h-3" /> Marcar todas
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-[320px] overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma notificação.</p>
            ) : (
              notifications.map((n) => (
                <NotificationItem key={n.id} notification={n} onMarkRead={markAsRead} />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function NotificationItem({ notification: n, onMarkRead }: { notification: AppNotification; onMarkRead: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const config = typeConfig[n.type] || typeConfig.info;
  const Icon = config.icon;

  const handleClick = () => {
    if (!n.is_read) onMarkRead(n.id);
    setExpanded((prev) => !prev);
  };

  return (
    <div
      className={cn(
        "flex gap-3 px-4 py-3 border-b border-border/50 last:border-0 transition-colors cursor-pointer hover:bg-accent/50",
        !n.is_read && "bg-primary/5"
      )}
      onClick={handleClick}
    >
      <div className={cn("mt-0.5 shrink-0", config.color)}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className={cn("text-sm leading-tight", !n.is_read ? "font-semibold text-foreground" : "text-foreground/80")}>
            {n.title}
          </p>
          {!n.is_read && (
            <span className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1.5" />
          )}
        </div>
        <p className={cn("text-xs text-muted-foreground mt-0.5", !expanded && "line-clamp-2")}>
          {n.message}
        </p>
        <p className="text-[10px] text-muted-foreground/70 mt-1">
          {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: ptBR })}
        </p>
      </div>
    </div>
  );
}
