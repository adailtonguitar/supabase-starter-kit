import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate, Sequence } from "remotion";
import { AnimatedText } from "../components/AnimatedText";
import { GlowingBadge } from "../components/GlowingBadge";
import { colors, fonts } from "../theme";

export const Scene1Intro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Logo circle animation
  const logoScale = spring({ frame: frame - 10, fps, config: { damping: 12, stiffness: 100 } });
  const logoRotate = interpolate(frame, [10, 60], [180, 0], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });

  // Subtitle fade
  const subtitleOpacity = interpolate(frame, [80, 100], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const subtitleY = interpolate(frame, [80, 100], [20, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Decorative line
  const lineWidth = spring({ frame: frame - 50, fps, config: { damping: 200 } });

  return (
    <AbsoluteFill
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Logo mark */}
      <div
        style={{
          width: 120,
          height: 120,
          borderRadius: 30,
          background: `linear-gradient(135deg, ${colors.primary}, ${colors.primaryDark})`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transform: `scale(${logoScale}) rotate(${logoRotate}deg)`,
          boxShadow: `0 20px 60px ${colors.primary}40`,
          marginBottom: 40,
        }}
      >
        <span style={{ fontSize: 60, fontWeight: 800, fontFamily: fonts.display, color: "#fff" }}>A</span>
      </div>

      {/* Badge */}
      <Sequence from={25}>
        <GlowingBadge text="Sistema de Gestão Completo" delay={0} />
      </Sequence>

      {/* Main title */}
      <div style={{ marginTop: 32 }}>
        <AnimatedText text="AnthoSystem" delay={35} fontSize={96} fontWeight={800} color={colors.text} letterSpacing={-3} />
      </div>

      {/* Decorative line */}
      <div
        style={{
          width: interpolate(lineWidth, [0, 1], [0, 300]),
          height: 3,
          background: `linear-gradient(90deg, transparent, ${colors.primary}, transparent)`,
          marginTop: 24,
          marginBottom: 24,
          borderRadius: 2,
        }}
      />

      {/* Subtitle */}
      <div
        style={{
          opacity: subtitleOpacity,
          transform: `translateY(${subtitleY}px)`,
          textAlign: "center",
        }}
      >
        <p
          style={{
            fontSize: 28,
            fontFamily: fonts.body,
            color: colors.textMuted,
            maxWidth: 700,
            lineHeight: 1.6,
          }}
        >
          PDV, Fiscal, Financeiro e Estoque —{" "}
          <span style={{ color: colors.primaryGlow, fontWeight: 600 }}>tudo integrado</span>
        </p>
      </div>

      {/* Floating stats */}
      <Sequence from={100}>
        <FloatingStat value="NFC-e" label="Emissão Fiscal" x={180} y={650} delay={0} />
      </Sequence>
      <Sequence from={110}>
        <FloatingStat value="PDV" label="Ponto de Venda" x={1520} y={300} delay={0} />
      </Sequence>
      <Sequence from={120}>
        <FloatingStat value="360°" label="Gestão Completa" x={1600} y={700} delay={0} />
      </Sequence>
    </AbsoluteFill>
  );
};

const FloatingStat: React.FC<{ value: string; label: string; x: number; y: number; delay: number }> = ({
  value, label, x, y, delay,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const progress = spring({ frame: frame - delay, fps, config: { damping: 15 } });
  const float = Math.sin(frame * 0.05) * 5;

  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        transform: `scale(${interpolate(progress, [0, 1], [0.5, 1])}) translateY(${float}px)`,
        opacity: interpolate(progress, [0, 1], [0, 1]),
        background: `${colors.bgLight}CC`,
        borderRadius: 16,
        padding: "16px 24px",
        border: `1px solid ${colors.primary}25`,
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 28, fontWeight: 800, fontFamily: fonts.display, color: colors.primary }}>{value}</div>
      <div style={{ fontSize: 13, fontFamily: fonts.body, color: colors.textMuted, marginTop: 4 }}>{label}</div>
    </div>
  );
};
