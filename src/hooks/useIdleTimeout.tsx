/**
 * useIdleTimeout — Auto-logout after prolonged inactivity.
 * Shows a warning dialog before logging out.
 */
import { useEffect, useRef, useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
const WARNING_BEFORE_MS = 2 * 60 * 1000; // warn 2 min before
const ACTIVITY_EVENTS = ["mousedown", "keydown", "touchstart", "scroll", "mousemove"] as const;
const THROTTLE_MS = 30_000; // only reset timer every 30s max

export function useIdleTimeout() {
  const { user } = useAuth();
  const [showWarning, setShowWarning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastActivityRef = useRef(Date.now());

  const clearAllTimers = useCallback(() => {
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
    setShowWarning(false);
  }, []);

  const doLogout = useCallback(async () => {
    clearAllTimers();
    await supabase.auth.signOut();
    window.location.href = "/";
  }, [clearAllTimers]);

  const resetTimers = useCallback(() => {
    if (!user) return;
    clearAllTimers();

    // Set warning timer (fires 2min before logout)
    warningTimerRef.current = setTimeout(() => {
      setShowWarning(true);
      let remaining = Math.floor(WARNING_BEFORE_MS / 1000);
      setSecondsLeft(remaining);
      countdownRef.current = setInterval(() => {
        remaining -= 1;
        setSecondsLeft(remaining);
        if (remaining <= 0) {
          if (countdownRef.current) clearInterval(countdownRef.current);
        }
      }, 1000);
    }, IDLE_TIMEOUT_MS - WARNING_BEFORE_MS);

    // Set logout timer
    logoutTimerRef.current = setTimeout(doLogout, IDLE_TIMEOUT_MS);
  }, [user, clearAllTimers, doLogout]);

  const handleActivity = useCallback(() => {
    const now = Date.now();
    if (now - lastActivityRef.current < THROTTLE_MS) return;
    lastActivityRef.current = now;
    resetTimers();
  }, [resetTimers]);

  const dismissWarning = useCallback(() => {
    // User clicked "Continue" — reset everything
    lastActivityRef.current = Date.now();
    resetTimers();
  }, [resetTimers]);

  useEffect(() => {
    if (!user) {
      clearAllTimers();
      return;
    }

    resetTimers();

    for (const event of ACTIVITY_EVENTS) {
      document.addEventListener(event, handleActivity, { passive: true });
    }

    return () => {
      clearAllTimers();
      for (const event of ACTIVITY_EVENTS) {
        document.removeEventListener(event, handleActivity);
      }
    };
  }, [user, resetTimers, handleActivity, clearAllTimers]);

  return { showWarning, secondsLeft, dismissWarning, doLogout };
}
