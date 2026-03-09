import { memo } from "react";
import { Link } from "react-router-dom";
import anthoLogo from "@/assets/logo-as.png";
import { NotificationBell } from "./NotificationBell";
import { useAuth } from "@/hooks/useAuth";

function UserAvatarMini({ email }: { email?: string }) {
  const initials = email
    ? (() => {
        const parts = email.split("@")[0].split(/[._-]/);
        return parts.length >= 2
          ? (parts[0][0] + parts[1][0]).toUpperCase()
          : email.substring(0, 2).toUpperCase();
      })()
    : "?";

  return (
    <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center text-xs font-bold text-primary">
      {initials}
    </div>
  );
}

export const MobileTopBar = memo(function MobileTopBar() {
  const { user } = useAuth();

  return (
    <header className="h-14 shrink-0 flex items-center justify-between px-4 bg-card/95 backdrop-blur-xl border-b border-border/60 safe-area-top">
      {/* Logo */}
      <Link to="/dashboard" className="flex items-center gap-2">
        <img src={anthoLogo} alt="AnthoSystem" className="h-7 w-auto" />
        <span className="text-sm font-bold text-foreground">AnthoSystem</span>
      </Link>

      {/* Right actions */}
      <div className="flex items-center gap-2">
        <NotificationBell />
        <Link to="/configuracoes">
          <UserAvatarMini email={user?.email} />
        </Link>
      </div>
    </header>
  );
});
