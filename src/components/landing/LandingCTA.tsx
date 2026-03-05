import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";

export function LandingCTA() {
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
        <Button asChild size="lg" className="mt-10 text-base px-10 h-14 font-semibold shadow-xl shadow-primary/30 rounded-xl">
          <Link to="/auth">
            Criar conta grátis
            <ArrowRight className="w-4 h-4 ml-2" />
          </Link>
        </Button>
      </motion.div>
    </section>
  );
}
