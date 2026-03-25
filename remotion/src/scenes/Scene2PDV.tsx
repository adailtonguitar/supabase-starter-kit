import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate, Sequence } from "remotion";
import { AnimatedText } from "../components/AnimatedText";
import { FeatureCard } from "../components/FeatureCard";
import { colors, fonts } from "../theme";

export const Scene2PDV: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Section header
  const headerProgress = spring({ frame, fps, config: { damping: 20, stiffness: 200 } });

  return (
    <AbsoluteFill style={{ padding: 80 }}>
      {/* Section indicator */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          opacity: interpolate(headerProgress, [0, 1], [0, 1]),
          transform: `translateX(${interpolate(headerProgress, [0, 1], [-40, 0])}px)`,
        }}
      >
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 14,
            background: `linear-gradient(135deg, ${colors.primary}, ${colors.primaryDark})`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 24,
          }}
        >
          🛒
        </div>
        <span style={{ fontSize: 16, fontWeight: 600, fontFamily: fonts.body, color: colors.primary, letterSpacing: 2, textTransform: "uppercase" }}>
          Ponto de Venda
        </span>
      </div>

      {/* Title */}
      <div style={{ marginTop: 24 }}>
        <AnimatedText text="PDV Rápido e Completo" delay={10} fontSize={72} fontWeight={800} />
      </div>

      {/* Subtitle */}
      <Sequence from={30}>
        <SubtitleReveal text="Venda com código de barras, múltiplos pagamentos e emissão fiscal automática." />
      </Sequence>

      {/* Feature cards */}
      <FeatureCard icon="📱" title="Leitor de Código de Barras" description="Escaneie produtos com câmera ou leitor USB. Busca instantânea." delay={40} x={80} y={420} width={420} />
      <FeatureCard icon="💳" title="Multi-Pagamento" description="PIX, cartão, dinheiro, fiado — divida entre formas de pagamento." delay={55} x={550} y={420} width={420} />
      <FeatureCard icon="🧾" title="NFC-e Automática" description="Emissão fiscal integrada com SEFAZ. Sem complicação." delay={70} x={1020} y={420} width={420} />

      {/* Keyboard shortcuts */}
      <Sequence from={90}>
        <KeyboardShortcuts />
      </Sequence>
    </AbsoluteFill>
  );
};

const SubtitleReveal: React.FC<{ text: string }> = ({ text }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" });
  const y = interpolate(frame, [0, 20], [15, 0], { extrapolateRight: "clamp" });

  return (
    <p
      style={{
        fontSize: 24,
        fontFamily: fonts.body,
        color: colors.textMuted,
        maxWidth: 800,
        lineHeight: 1.5,
        opacity,
        transform: `translateY(${y}px)`,
        marginTop: 16,
      }}
    >
      {text}
    </p>
  );
};

const KeyboardShortcuts: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const shortcuts = [
    { key: "F2", label: "Finalizar" },
    { key: "F3", label: "Buscar" },
    { key: "F5", label: "Fidelidade" },
    { key: "F6", label: "Cancelar" },
  ];

  return (
    <div style={{ position: "absolute", bottom: 80, left: 80, display: "flex", gap: 24 }}>
      {shortcuts.map((sc, i) => {
        const progress = spring({ frame: frame - i * 8, fps, config: { damping: 15 } });
        return (
          <div
            key={sc.key}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              opacity: interpolate(progress, [0, 1], [0, 1]),
              transform: `translateY(${interpolate(progress, [0, 1], [20, 0])}px)`,
            }}
          >
            <div
              style={{
                padding: "8px 16px",
                borderRadius: 10,
                background: colors.bgLighter,
                border: `1px solid ${colors.primary}30`,
                fontSize: 16,
                fontWeight: 700,
                fontFamily: fonts.mono,
                color: colors.primary,
              }}
            >
              {sc.key}
            </div>
            <span style={{ fontSize: 14, fontFamily: fonts.body, color: colors.textMuted }}>{sc.label}</span>
          </div>
        );
      })}
    </div>
  );
};
