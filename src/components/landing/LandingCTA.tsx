import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function LandingCTA() {
  const [demoLoading, setDemoLoading] = useState(false);
  const navigate = useNavigate();

  const handleDemo = async () => {
    setDemoLoading(true);
    try {
      const demoId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const companyName = `Loja Demo ${demoId.toUpperCase()}`;
      const { data, error } = await supabase.functions.invoke("create-demo-account", {
        body: { company_name: companyName },
      });
      if (error || !data?.email) throw new Error(error?.message || "Erro ao criar conta demo");
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      });
      if (signInError) throw signInError;
      // localStorage.setItem("as_selected_company", data.company_id); removed for strict Supabase-only audit.
      toast.success("Conta demo criada! Explore o sistema à vontade.");
      navigate("/dashboard");
    } catch (err: any) {
      toast.error(err?.message || "Erro ao criar demo");
    } finally {
      setDemoLoading(false);
    }
  };

  return (
    <section className="py-28 relative overflow-hidden">
      {/* Dramatic gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-primary/15 to-background pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] rounded-full bg-primary/12 blur-[150px] pointer-events-none" />
      <div className="absolute top-0 left-0 w-[300px] h-[300px] rounded-full bg-primary/8 blur-[100px] pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[300px] h-[300px] rounded-full bg-cyan-500/6 blur-[100px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="relative max-w-3xl mx-auto px-6 text-center"
      >
        <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight">
          Pronto para{" "}
          <span className="gradient-text">modernizar</span>
          {" "}seu negócio?
        </h2>
        <p className="mt-6 text-lg text-muted-foreground leading-relaxed">
          Cadastre-se em segundos e comece a vender hoje mesmo.
          <br />
          <strong className="text-foreground font-semibold">15 dias grátis, sem compromisso.</strong>
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center mt-10">
          <Button asChild size="lg" className="text-base px-10 h-14 font-semibold shadow-xl shadow-primary/30 rounded-xl">
            <Link to="/auth">
              Criar conta grátis
              <ArrowRight className="w-4 h-4 ml-2" />
            </Link>
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="text-base px-10 h-14 font-medium rounded-xl border-primary/30 hover:bg-primary/5"
            onClick={handleDemo}
            disabled={demoLoading}
          >
            <Zap className="w-4 h-4 mr-2" />
            {demoLoading ? "Criando demo..." : "Testar sem cadastro"}
          </Button>
        </div>
      </motion.div>
    </section>
  );
}
