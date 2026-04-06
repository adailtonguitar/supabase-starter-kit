import { useState, useEffect, useRef } from "react";
import { SEOHead } from "@/components/SEOHead";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Mail, Lock, ArrowRight, KeyRound, Eye, EyeOff, Play, ShieldAlert } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";

const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION = 2 * 60 * 1000; // 2 minutes

const authErrorMap: Record<string, string> = {
  "Invalid login credentials": "E-mail ou senha incorretos",
  "Email not confirmed": "E-mail ainda não confirmado. Verifique sua caixa de entrada.",
  "User not found": "Usuário não encontrado",
  "Email rate limit exceeded": "Muitas tentativas. Aguarde alguns minutos.",
  "For security purposes, you can only request this after": "Por segurança, aguarde antes de tentar novamente.",
  "Password should be at least 6 characters": "A senha deve ter pelo menos 6 caracteres",
  "User already registered": "Este e-mail já está cadastrado",
  "Signup requires a valid password": "Informe uma senha válida",
  "Unable to validate email address: invalid format": "Formato de e-mail inválido",
};

function translateAuthError(msg: string): string {
  if (authErrorMap[msg]) return authErrorMap[msg];
  for (const [key, val] of Object.entries(authErrorMap)) {
    if (msg.includes(key)) return val;
  }
  return msg;
}

/** Evita botão "Processando..." infinito se o Supabase não responder (rede, SW, bloqueio). */
function withTimeout<T>(promise: Promise<T>, ms: number, timeoutMessage: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(timeoutMessage)), ms);
    promise
      .then((v) => {
        clearTimeout(t);
        resolve(v);
      })
      .catch((e) => {
        clearTimeout(t);
        reject(e);
      });
  });
}

const SIGN_IN_TIMEOUT_MS = 35_000;

export default function Auth() {
  const [email, setEmail] = useState(() => localStorage.getItem("remember-email") || "");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(() => localStorage.getItem("remember-email") !== null);
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [signUpName, setSignUpName] = useState("");
  
  // Rate limiting state — persisted in localStorage to survive page refresh
  const LOCKOUT_STORAGE_KEY = "as_login_lockout";
  const ATTEMPTS_STORAGE_KEY = "as_login_attempts";

  const [failedAttempts, setFailedAttempts] = useState(() => {
    try {
      const stored = localStorage.getItem(ATTEMPTS_STORAGE_KEY);
      return stored ? parseInt(stored, 10) || 0 : 0;
    } catch { return 0; }
  });
  const [lockedUntil, setLockedUntil] = useState<number | null>(() => {
    try {
      const stored = localStorage.getItem(LOCKOUT_STORAGE_KEY);
      if (stored) {
        const ts = parseInt(stored, 10);
        return ts > Date.now() ? ts : null;
      }
      return null;
    } catch { return null; }
  });
  const [lockCountdown, setLockCountdown] = useState(0);
  const lockTimerRef = useRef<ReturnType<typeof setInterval>>();

  // Persist lockout state to localStorage
  useEffect(() => {
    try {
      if (lockedUntil) {
        localStorage.setItem(LOCKOUT_STORAGE_KEY, String(lockedUntil));
      } else {
        localStorage.removeItem(LOCKOUT_STORAGE_KEY);
      }
    } catch { /* ignore */ }
  }, [lockedUntil]);

  useEffect(() => {
    try {
      localStorage.setItem(ATTEMPTS_STORAGE_KEY, String(failedAttempts));
    } catch { /* ignore */ }
  }, [failedAttempts]);

  const isLocked = lockedUntil !== null && Date.now() < lockedUntil;

  // Countdown timer for lockout
  useEffect(() => {
    if (lockedUntil) {
      const tick = () => {
        const remaining = Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000));
        setLockCountdown(remaining);
        if (remaining <= 0) {
          setLockedUntil(null);
          setFailedAttempts(0);
          if (lockTimerRef.current) clearInterval(lockTimerRef.current);
        }
      };
      tick();
      lockTimerRef.current = setInterval(tick, 1000);
      return () => { if (lockTimerRef.current) clearInterval(lockTimerRef.current); };
    }
  }, [lockedUntil]);
  
  const [mode, setMode] = useState<"login" | "set-password" | "processing">(() => {
    if (sessionStorage.getItem("needs-password-setup") === "true") {
      return "set-password";
    }
    const hash = window.location.hash;
    if (hash) {
      const hashParams = new URLSearchParams(hash.substring(1));
      const type = hashParams.get("type");
      if (type === "recovery" || type === "invite" || type === "magiclink") {
        sessionStorage.setItem("needs-password-setup", "true");
        return "set-password";
      }
      if (hash.includes("access_token")) {
        return "processing";
      }
    }
    return "login";
  });
  const navigate = useNavigate();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // auth state change event

      if (event === "PASSWORD_RECOVERY") {
        sessionStorage.setItem("needs-password-setup", "true");
        setMode("set-password");
        toast.info("Defina sua senha para acessar o sistema");
        return;
      }

      if (event === "SIGNED_IN" && session?.user) {
        const hash = window.location.hash;
        const hashParams = new URLSearchParams(hash.substring(1));
        const type = hashParams.get("type");

        const isInvitedUser = type === "invite" || type === "magiclink" || type === "recovery";
        const hasNoPasswordLogin = !session.user.last_sign_in_at ||
          (session.user.created_at === session.user.last_sign_in_at);

        if (isInvitedUser || (hasNoPasswordLogin && hash.includes("access_token"))) {
          sessionStorage.setItem("needs-password-setup", "true");
          setMode("set-password");
          toast.info("Defina sua senha para acessar o sistema");
          return;
        }
      }
    });

    const handleAuthCallback = async () => {
      const hash = window.location.hash;

      if (hash && (hash.includes("access_token") || hash.includes("type="))) {
        try {
          const hashParams = new URLSearchParams(hash.substring(1));
          const type = hashParams.get("type");

          if (type === "recovery" || type === "invite" || type === "magiclink") {
            return;
          }

          const { data } = await supabase.auth.getSession();
          if (data.session) {
            navigate("/");
            return;
          }
        } catch {
          // callback processing error
        }
      }

      if (sessionStorage.getItem("needs-password-setup") !== "true") {
        setMode("login");
      }
    };

    handleAuthCallback();

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error("As senhas não conferem");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("A senha deve ter no mínimo 6 caracteres");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      sessionStorage.removeItem("needs-password-setup");
      toast.success("Senha definida com sucesso!");
      navigate("/");
    } catch (error: any) {
      toast.error(translateAuthError(error.message || "Erro ao definir senha"));
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail.trim()) {
      toast.error("Informe seu e-mail");
      return;
    }
    setLoading(true);
    try {
      // console.log("[Auth] Sending recovery email via edge function to:", forgotEmail);
      const { data, error } = await supabase.functions.invoke("send-recovery-email", {
        body: { email: forgotEmail, redirectTo: `${window.location.origin}/reset-password` },
      });
      if (error) {
        // Handle ReadableStream response
        let errorMsg = "Erro ao enviar e-mail de recuperação";
        if (error.message) errorMsg = error.message;
        throw new Error(errorMsg);
      }
      if (data?.error) throw new Error(data.error);
      toast.success("E-mail de recuperação enviado! Verifique sua caixa de entrada.");
      setShowForgotPassword(false);
    } catch (error: any) {
      console.error("[Auth] Recovery error details:", error);
      toast.error(translateAuthError(error.message || "Erro ao enviar e-mail de recuperação"));
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signUpName.trim()) {
      toast.error("Informe seu nome");
      return;
    }
    if (password.length < 6) {
      toast.error("A senha deve ter no mínimo 6 caracteres");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: signUpName.trim() },
          emailRedirectTo: window.location.origin,
        },
      });
      if (error) throw error;
      toast.success("Conta criada! Verifique seu e-mail para confirmar.");
      setIsSignUp(false);
    } catch (error: any) {
      toast.error(translateAuthError(error.message || "Erro ao criar conta"));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: window.location.origin,
        },
      });
      if (error) throw error;
    } catch (error: any) {
      toast.error(translateAuthError(error.message || "Erro ao entrar com Google"));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Client-side rate limiting
    if (isLocked) {
      toast.error(`Muitas tentativas. Aguarde ${lockCountdown}s antes de tentar novamente.`);
      return;
    }

    setLoading(true);

    try {
      if (rememberMe) {
        localStorage.setItem("remember-email", email);
      } else {
        localStorage.removeItem("remember-email");
      }
      sessionStorage.removeItem("needs-password-setup");
      const { error } = await withTimeout(
        supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password }),
        SIGN_IN_TIMEOUT_MS,
        "Tempo esgotado ao conectar. Verifique sua internet, desative VPN/extensões ou tente outra rede.",
      );
      if (error) throw error;

      // Success — reset attempts
      setFailedAttempts(0);
      setLockedUntil(null);
      toast.success("Login realizado com sucesso!");
      navigate("/");
    } catch (error: unknown) {
      const newAttempts = failedAttempts + 1;
      setFailedAttempts(newAttempts);

      const errMsg = error instanceof Error ? error.message : String(error);
      const emailNorm = email.trim().toLowerCase();

      // Log failed attempt (fire-and-forget) — colunas alinhadas a `public.system_errors`
      void supabase.from("system_errors").insert({
        user_email: emailNorm,
        page: window.location.pathname || "/auth",
        action: "auth_failed_login",
        error_message: `Tentativa ${newAttempts} falha para ${emailNorm}: ${errMsg}`,
        error_stack: JSON.stringify({
          attempt: newAttempts,
          max_lockout: newAttempts >= MAX_ATTEMPTS,
          user_agent: navigator.userAgent,
        }),
        browser: navigator.userAgent.slice(0, 240),
        device: /Mobi|Android/i.test(navigator.userAgent) ? "Mobile" : "Desktop",
      });

      // Lock after MAX_ATTEMPTS
      if (newAttempts >= MAX_ATTEMPTS) {
        const lockTime = Date.now() + LOCKOUT_DURATION;
        setLockedUntil(lockTime);
        toast.error(`Conta bloqueada temporariamente. Tente novamente em ${LOCKOUT_DURATION / 1000}s.`);
      } else {
        const remaining = MAX_ATTEMPTS - newAttempts;
        const msg = translateAuthError(errMsg || "Erro ao fazer login");
        toast.error(`${msg} (${remaining} tentativa${remaining > 1 ? "s" : ""} restante${remaining > 1 ? "s" : ""})`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDemoSignUp = async () => {
    setLoading(true);
    try {
      const demoId = Date.now().toString(36);
      const companyName = `Loja Demo ${demoId.toUpperCase()}`;

      const { data, error } = await supabase.functions.invoke("create-demo-account", {
        body: { company_name: companyName },
      });

      if (error) throw new Error(error.message || "Erro ao criar conta demo");
      if (data?.error) throw new Error(data.error);

      // Sign in with the created credentials
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      });

      if (signInError) throw signInError;

      // Seed is now done server-side in create-demo-account
      const seed = data.seed;
      if (seed && seed.products > 0) {
        // Mark as seeded in localStorage so DemoBanner doesn't re-seed
        try { localStorage.setItem(`as_demo_seeded_${data.company_id}`, "true"); } catch {}
        toast.success("Conta demo pronta! 🎉", {
          description: `${seed.products} produtos, ${seed.clients} clientes, ${seed.sales} vendas criados.`,
        });
      } else {
        toast.success("Conta demo criada!");
      }

      navigate("/");
    } catch (error: any) {
      toast.error(error.message || "Erro ao criar conta demo");
    } finally {
      setLoading(false);
    }
  };

  if (mode === "processing") {
    return (
      <div className="h-screen overflow-y-auto flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 overflow-y-auto flex flex-col items-center bg-background p-4 py-8 min-h-screen">
      <SEOHead title="Entrar" description="Acesse sua conta AnthoSystem. Sistema de gestão para comércio e varejo com PDV, estoque e fiscal." path="/auth" />
      <div className="flex-1" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <h1 className="text-xl font-bold text-foreground mt-3 tracking-wide">AnthoSystem</h1>
        </div>

        {/* Form card */}
        <div className="bg-card rounded-2xl card-shadow border border-border p-6">
          {mode === "set-password" ? (
            <>
              <h2 className="text-lg font-semibold text-foreground mb-1">Definir Senha</h2>
              <p className="text-sm text-muted-foreground mb-6">
                Crie uma senha para acessar o sistema
              </p>

              <form onSubmit={handleSetPassword} className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">Nova Senha</label>
                  <div className="relative">
                    <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type={showNewPassword ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      minLength={6}
                      className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-background border border-border text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                    />
                    <button type="button" onClick={() => setShowNewPassword(!showNewPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                      {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">Confirmar Senha</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type={showConfirmPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      minLength={6}
                      className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-background border border-border text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                    />
                    <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                      {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-all disabled:opacity-50"
                >
                  {loading ? "Processando..." : "Definir Senha"}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            </>
          ) : (
            <>
              <h2 className="text-lg font-semibold text-foreground mb-1">
                {isSignUp ? "Criar Conta" : "Entrar"}
              </h2>
              <p className="text-sm text-muted-foreground mb-6">
                {isSignUp
                  ? "Preencha os dados para criar sua conta"
                  : "Acesse sua conta para continuar"}
              </p>

              <form onSubmit={isSignUp ? handleSignUp : handleSubmit} className="space-y-4">
                {isSignUp && (
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1.5 block">Nome</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <input
                        type="text"
                        value={signUpName}
                        onChange={(e) => setSignUpName(e.target.value)}
                        placeholder="Seu nome completo"
                        required
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-background border border-border text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">E-mail</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="seu@email.com"
                      required
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-background border border-border text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">Senha</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      minLength={6}
                      className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-background border border-border text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {!isSignUp && (
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="w-4 h-4 rounded border-border text-primary focus:ring-primary/20 accent-primary"
                    />
                    <span className="text-sm text-muted-foreground">Lembrar meu e-mail</span>
                  </label>
                )}

                {/* Rate limit warning */}
                {isLocked && (
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                    <ShieldAlert className="w-4 h-4 shrink-0" />
                    <span>Muitas tentativas. Aguarde <strong>{lockCountdown}s</strong> para tentar novamente.</span>
                  </div>
                )}

                {!isLocked && failedAttempts > 0 && !isSignUp && (
                  <p className="text-xs text-destructive text-center">
                    {MAX_ATTEMPTS - failedAttempts} tentativa{MAX_ATTEMPTS - failedAttempts > 1 ? "s" : ""} restante{MAX_ATTEMPTS - failedAttempts > 1 ? "s" : ""}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={loading || isLocked}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-all disabled:opacity-50"
                >
                  {loading ? "Processando..." : isSignUp ? "Criar Conta" : "Entrar"}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>

              {/* Google Sign In */}
              <div className="mt-4">
                <div className="relative flex items-center justify-center my-3">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-border" />
                  </div>
                  <span className="relative bg-card px-3 text-xs text-muted-foreground">ou</span>
                </div>
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-3 py-2.5 rounded-xl bg-background border border-border text-foreground text-sm font-medium hover:bg-accent/50 transition-all disabled:opacity-50"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  Entrar com Google
                </button>
              </div>

              {!isSignUp && showForgotPassword ? (
                <div className="mt-4 pt-4 border-t border-border">
                  <p className="text-sm font-medium text-foreground mb-3">Recuperar senha</p>
                  <form onSubmit={handleForgotPassword} className="space-y-3">
                    <input
                      type="email"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      placeholder="Seu e-mail cadastrado"
                      required
                      className="w-full px-4 py-2.5 rounded-xl bg-background border border-border text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setShowForgotPassword(false)}
                        className="flex-1 py-2.5 rounded-xl bg-secondary text-secondary-foreground text-sm font-medium hover:opacity-90 transition-all"
                      >
                        Voltar
                      </button>
                      <button
                        type="submit"
                        disabled={loading}
                        className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-all disabled:opacity-50"
                      >
                        {loading ? "Enviando..." : "Enviar"}
                      </button>
                    </div>
                  </form>
                </div>
              ) : (
                <div className="mt-4 text-center space-y-2">
                  {!isSignUp && (
                    <button
                      type="button"
                      onClick={() => setShowForgotPassword(true)}
                      className="text-sm text-primary hover:underline"
                    >
                      Esqueci minha senha
                    </button>
                  )}
                  <p className="text-sm text-muted-foreground">
                    {isSignUp ? "Já tem conta?" : "Não tem conta?"}{" "}
                    <button
                      type="button"
                      onClick={() => { setIsSignUp(!isSignUp); setShowForgotPassword(false); }}
                      className="text-primary hover:underline font-medium"
                    >
                      {isSignUp ? "Entrar" : "Criar conta"}
                    </button>
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Demo button */}
        <div className="mt-4 p-4 rounded-2xl border border-dashed border-primary/30 bg-primary/5 text-center">
          <p className="text-sm text-muted-foreground mb-2">Quer conhecer o sistema sem compromisso?</p>
          <button
            onClick={handleDemoSignUp}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-accent text-accent-foreground text-sm font-semibold hover:opacity-90 transition-all disabled:opacity-50"
          >
            <Play className="w-4 h-4" />
            {loading ? "Criando conta demo..." : "Testar gratuitamente"}
          </button>
        </div>

        {/* Link para planos */}
        <p className="text-center text-sm text-muted-foreground mt-4">
          <Link to="/" className="text-primary hover:underline font-medium">
            Ver planos e preços
          </Link>
        </p>
      </motion.div>
      <div className="flex-1" />
    </div>
  );
}
