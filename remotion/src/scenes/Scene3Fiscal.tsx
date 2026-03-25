import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate, Sequence } from "remotion";
import { AnimatedText } from "../components/AnimatedText";
import { colors, fonts } from "../theme";

export const Scene3Fiscal: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const headerProgress = spring({ frame, fps, config: { damping: 20, stiffness: 200 } });

  return (
    <AbsoluteFill style={{ padding: 80 }}>
      {/* Header */}
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
            background: `linear-gradient(135deg, ${colors.accent}, #2563EB)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 24,
          }}
        >
          📋
        </div>
        <span style={{ fontSize: 16, fontWeight: 600, fontFamily: fonts.body, color: colors.accent, letterSpacing: 2, textTransform: "uppercase" }}>
          Módulo Fiscal
        </span>
      </div>

      <div style={{ marginTop: 24 }}>
        <AnimatedText text="Fiscal Sem Dor de Cabeça" delay={10} fontSize={72} fontWeight={800} />
      </div>

      {/* Two column layout */}
      <div style={{ display: "flex", gap: 60, marginTop: 60 }}>
        {/* Left - Document types */}
        <div style={{ flex: 1 }}>
          <Sequence from={30}>
            <DocumentTypeList />
          </Sequence>
        </div>

        {/* Right - Mock document */}
        <div style={{ flex: 1 }}>
          <Sequence from={50}>
            <MockDocument />
          </Sequence>
        </div>
      </div>
    </AbsoluteFill>
  );
};

const DocumentTypeList: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const items = [
    { icon: "🧾", label: "NFC-e — Nota Fiscal de Consumidor", color: colors.primary },
    { icon: "📄", label: "NF-e — Nota Fiscal Eletrônica", color: colors.accent },
    { icon: "📊", label: "SPED — Escrituração Digital", color: colors.purple },
    { icon: "🔍", label: "Consulta DF-e — SEFAZ", color: colors.amber },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {items.map((item, i) => {
        const progress = spring({ frame: frame - i * 12, fps, config: { damping: 15 } });
        return (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 20,
              padding: "20px 28px",
              borderRadius: 16,
              background: colors.bgLight,
              border: `1px solid ${item.color}25`,
              opacity: interpolate(progress, [0, 1], [0, 1]),
              transform: `translateX(${interpolate(progress, [0, 1], [-50, 0])}px)`,
            }}
          >
            <span style={{ fontSize: 32 }}>{item.icon}</span>
            <span style={{ fontSize: 18, fontFamily: fonts.body, color: colors.text, fontWeight: 500 }}>
              {item.label}
            </span>
          </div>
        );
      })}
    </div>
  );
};

const MockDocument: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const progress = spring({ frame, fps, config: { damping: 15, stiffness: 80, mass: 2 } });
  const scale = interpolate(progress, [0, 1], [0.85, 1]);
  const opacity = interpolate(progress, [0, 1], [0, 1]);

  // Stamp animation
  const stampProgress = spring({ frame: frame - 40, fps, config: { damping: 8 } });
  const stampScale = interpolate(stampProgress, [0, 1], [3, 1]);
  const stampOpacity = interpolate(stampProgress, [0, 1], [0, 1]);

  return (
    <div
      style={{
        transform: `scale(${scale})`,
        opacity,
        background: colors.bgLight,
        borderRadius: 20,
        padding: 40,
        border: `1px solid ${colors.bgLighter}`,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Mock NFC-e content */}
      <div style={{ fontSize: 14, fontFamily: fonts.mono, color: colors.textMuted, marginBottom: 20 }}>
        NFC-e nº 000.142.857
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {["Produto A — R$ 29,90", "Produto B — R$ 45,00", "Produto C — R$ 18,50"].map((line, i) => (
          <div key={i} style={{ fontSize: 16, fontFamily: fonts.body, color: colors.text, padding: "8px 0", borderBottom: `1px solid ${colors.bgLighter}` }}>
            {line}
          </div>
        ))}
      </div>
      <div style={{ marginTop: 20, fontSize: 24, fontWeight: 700, fontFamily: fonts.display, color: colors.primary }}>
        Total: R$ 93,40
      </div>

      {/* Authorized stamp */}
      <div
        style={{
          position: "absolute",
          right: 30,
          top: 30,
          transform: `scale(${stampScale}) rotate(-15deg)`,
          opacity: stampOpacity,
          border: `3px solid ${colors.success}`,
          borderRadius: 12,
          padding: "8px 20px",
          fontSize: 16,
          fontWeight: 800,
          fontFamily: fonts.display,
          color: colors.success,
          textTransform: "uppercase",
          letterSpacing: 2,
        }}
      >
        Autorizada ✓
      </div>
    </div>
  );
};
