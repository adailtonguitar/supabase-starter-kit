import { memo } from "react";
import { Link } from "react-router-dom";
import anthoLogo from "@/assets/logo-as.webp";
import { APP_VERSION } from "@/config/app";
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
        <div className="flex flex-col leading-none">
          <span className="text-sm font-bold text-foreground">AnthoSystem</span>
          <span className="text-[9px] text-muted-foreground">Seu ERP completo para varejo</span>
        </div>
      </Link>

      {/* Right actions */}
      <div className="flex items-center gap-2">
        <NotificationBell />
        <Link
          to="/configuracoes"
          aria-label="Abrir configurações da conta"
          className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <UserAvatarMini email={user?.email} />
        </Link>
      </div>
    </header>
  );
});
