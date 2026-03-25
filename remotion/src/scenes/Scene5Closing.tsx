import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate, Sequence } from "remotion";
import { AnimatedText } from "../components/AnimatedText";
import { GlowingBadge } from "../components/GlowingBadge";
import { colors, fonts } from "../theme";

export const Scene5Closing: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Big circle reveal
  const circleScale = spring({ frame: frame - 5, fps, config: { damping: 20, stiffness: 80 } });
  const circleSize = interpolate(circleScale, [0, 1], [0, 1200]);

  // Final fade for text
  const textOpacity = interpolate(frame, [30, 50], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Floating modules
  const modules = [
    { icon: "🛒", label: "PDV", x: 250, y: 350 },
    { icon: "📋", label: "Fiscal", x: 1500, y: 300 },
    { icon: "💰", label: "Financeiro", x: 200, y: 700 },
    { icon: "📦", label: "Estoque", x: 1550, y: 680 },
    { icon: "👥", label: "Clientes", x: 350, y: 150 },
    { icon: "📊", label: "Relatórios", x: 1400, y: 150 },
  ];

  return (
    <AbsoluteFill>
      {/* Center circle glow */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: circleSize,
          height: circleSize,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${colors.primary}12, transparent 70%)`,
          transform: "translate(-50%, -50%)",
        }}
      />

      {/* Floating module badges */}
      {modules.map((mod, i) => (
        <Sequence key={i} from={60 + i * 8}>
          <FloatingModule icon={mod.icon} label={mod.label} x={mod.x} y={mod.y} />
        </Sequence>
      ))}

      {/* Central content */}
      <AbsoluteFill style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div style={{ opacity: textOpacity }}>
          <GlowingBadge text="Pronto para Começar" delay={0} />
        </div>

        <div style={{ marginTop: 32 }}>
          <AnimatedText text="Seu Negócio," delay={40} fontSize={80} fontWeight={800} />
        </div>
        <AnimatedText text="Sob Controle." delay={55} fontSize={80} fontWeight={800} color={colors.primaryGlow} />

        {/* Version badge */}
        <Sequence from={100}>
          <VersionBadge />
        </Sequence>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const FloatingModule: React.FC<{ icon: string; label: string; x: number; y: number }> = ({ icon, label, x, y }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const progress = spring({ frame, fps, config: { damping: 12 } });
  const float = Math.sin(frame * 0.04) * 8;

  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        transform: `scale(${interpolate(progress, [0, 1], [0, 1])}) translateY(${float}px)`,
        opacity: interpolate(progress, [0, 1], [0, 0.7]),
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
      }}
    >
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: 18,
          background: `${colors.bgLight}`,
          border: `1px solid ${colors.primary}20`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 30,
        }}
      >
        {icon}
      </div>
      <span style={{ fontSize: 13, fontFamily: fonts.body, color: colors.textMuted, fontWeight: 500 }}>{label}</span>
    </div>
  );
};

const VersionBadge: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const progress = spring({ frame, fps, config: { damping: 20 } });

  return (
    <div
      style={{
        marginTop: 48,
        opacity: interpolate(progress, [0, 1], [0, 1]),
        transform: `translateY(${interpolate(progress, [0, 1], [20, 0])}px)`,
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}
    >
      <span style={{ fontSize: 18, fontFamily: fonts.body, color: colors.textMuted }}>anthosystem.com.br</span>
      <span style={{ fontSize: 14, fontFamily: fonts.mono, color: colors.primary, padding: "4px 12px", borderRadius: 8, background: `${colors.primary}15` }}>v1.1.0</span>
    </div>
  );
};
