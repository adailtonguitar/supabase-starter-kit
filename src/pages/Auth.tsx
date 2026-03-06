import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Mail, Lock, ArrowRight, KeyRound, Eye, EyeOff, Play } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";

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
      console.log("[Auth] Sending recovery email via edge function to:", forgotEmail);
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
    setLoading(true);

    try {
      if (rememberMe) {
        localStorage.setItem("remember-email", email);
      } else {
        localStorage.removeItem("remember-email");
      }
      sessionStorage.removeItem("needs-password-setup");
      const { data: signInData, error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
      // signIn completed
      if (error) throw error;
      toast.success("Login realizado com sucesso!");
      navigate("/");
    } catch (error: any) {
      const msg = translateAuthError(error.message || "Erro ao fazer login");
      toast.error(msg);
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

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-all disabled:opacity-50"
                >
                  {loading ? "Processando..." : isSignUp ? "Criar Conta" : "Entrar"}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>

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
