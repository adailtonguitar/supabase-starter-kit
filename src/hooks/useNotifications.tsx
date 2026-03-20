import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: "info" | "warning" | "alert" | "maintenance";
  created_at: string;
  is_read: boolean;
}

export function useNotifications() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = useCallback(async () => {
    if (!user) {
      setNotifications([]);
      setUnreadCount(0);
      setLoading(false);
      return;
    }

    try {
      type NotificationRow = Omit<AppNotification, "is_read">;
      type NotificationReadRow = { notification_id: string };

      // Get notifications visible to this user (RLS handles filtering)
      const { data: notifs } = await supabase
        .from("admin_notifications")
        .select("id, title, message, type, created_at")
        .order("created_at", { ascending: false })
        .limit(20);

      // Get read status
      const { data: reads } = await supabase
        .from("notification_reads")
        .select("notification_id")
        .eq("user_id", user.id);

      const readIds = new Set((reads || []).map((r: NotificationReadRow) => r.notification_id));

      const mapped: AppNotification[] = (notifs || []).map((n: NotificationRow) => ({
        ...n,
        is_read: readIds.has(n.id),
      }));

      // Hide read notifications older than 7 days
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const filtered = mapped.filter(
        (n) => !n.is_read || new Date(n.created_at).getTime() > sevenDaysAgo
      );

      setNotifications(filtered);
      setUnreadCount(filtered.filter((n) => !n.is_read).length);
    } catch (err) {
      console.error("[useNotifications]", err);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Poll every 60s for new notifications
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(fetchNotifications, 3 * 60000); // 3 min (was 1 min)
    return () => clearInterval(interval);
  }, [user, fetchNotifications]);

  const markAsRead = useCallback(async (notificationId: string) => {
    if (!user) return;
    await supabase
      .from("notification_reads")
      .insert({ notification_id: notificationId, user_id: user.id });

    setNotifications((prev) =>
      prev.map((n) => (n.id === notificationId ? { ...n, is_read: true } : n))
    );
    setUnreadCount((c) => Math.max(0, c - 1));
  }, [user]);

  const markAllAsRead = useCallback(async () => {
    if (!user) return;
    const unread = notifications.filter((n) => !n.is_read);
    if (unread.length === 0) return;

    const inserts = unread.map((n) => ({
      notification_id: n.id,
      user_id: user.id,
    }));

    await supabase.from("notification_reads").insert(inserts);

    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);
  }, [user, notifications]);

  return { notifications, unreadCount, loading, markAsRead, markAllAsRead, refetch: fetchNotifications };
}
