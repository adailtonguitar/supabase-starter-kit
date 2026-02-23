import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";

export function LandingCTA() {
  return (
    <section className="py-24 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5 pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] rounded-full bg-primary/8 blur-[100px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="relative max-w-3xl mx-auto px-6 text-center"
      >
        <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
          Pronto para modernizar seu supermercado?
        </h2>
        <p className="mt-5 text-lg text-muted-foreground leading-relaxed">
          Cadastre-se em segundos e comece a vender hoje mesmo.
          <br />
          <strong className="text-foreground font-semibold">8 dias grátis, sem compromisso.</strong>
        </p>
        <Button asChild size="lg" className="mt-10 text-base px-10 h-13 font-semibold shadow-lg shadow-primary/25">
          <Link to="/auth">
            Criar conta grátis
            <ArrowRight className="w-4 h-4 ml-2" />
          </Link>
        </Button>
      </motion.div>
    </section>
  );
}
