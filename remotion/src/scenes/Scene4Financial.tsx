import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate, Sequence } from "remotion";
import { AnimatedText } from "../components/AnimatedText";
import { colors, fonts } from "../theme";

export const Scene4Financial: React.FC = () => {
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
        }}
      >
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 14,
            background: `linear-gradient(135deg, ${colors.success}, #16A34A)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 24,
          }}
        >
          💰
        </div>
        <span style={{ fontSize: 16, fontWeight: 600, fontFamily: fonts.body, color: colors.success, letterSpacing: 2, textTransform: "uppercase" }}>
          Financeiro & Estoque
        </span>
      </div>

      <div style={{ marginTop: 24 }}>
        <AnimatedText text="Controle Total" delay={10} fontSize={72} fontWeight={800} />
      </div>

      {/* Dashboard mockup */}
      <div style={{ display: "flex", gap: 30, marginTop: 50 }}>
        {/* Stats row */}
        <Sequence from={30}>
          <StatsPanel />
        </Sequence>

        {/* Chart mockup */}
        <Sequence from={50}>
          <ChartMockup />
        </Sequence>
      </div>

      {/* Bottom features */}
      <div style={{ display: "flex", gap: 24, position: "absolute", bottom: 80, left: 80, right: 80 }}>
        {[
          { icon: "📦", text: "Estoque em tempo real" },
          { icon: "📊", text: "DRE automático" },
          { icon: "🔔", text: "Alertas financeiros" },
          { icon: "💹", text: "Fluxo de caixa projetado" },
        ].map((item, i) => (
          <Sequence key={i} from={80 + i * 10}>
            <BottomFeature icon={item.icon} text={item.text} />
          </Sequence>
        ))}
      </div>
    </AbsoluteFill>
  );
};

const StatsPanel: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const stats = [
    { label: "Vendas Hoje", value: "R$ 4.280", change: "+12%", color: colors.primary },
    { label: "Lucro Bruto", value: "R$ 1.856", change: "+8%", color: colors.success },
    { label: "Itens em Estoque", value: "2.847", change: "3 alertas", color: colors.amber },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, width: 400 }}>
      {stats.map((stat, i) => {
        const progress = spring({ frame: frame - i * 10, fps, config: { damping: 15 } });
        return (
          <div
            key={i}
            style={{
              padding: 24,
              borderRadius: 16,
              background: colors.bgLight,
              border: `1px solid ${stat.color}20`,
              opacity: interpolate(progress, [0, 1], [0, 1]),
              transform: `translateX(${interpolate(progress, [0, 1], [-30, 0])}px)`,
            }}
          >
            <div style={{ fontSize: 13, fontFamily: fonts.body, color: colors.textMuted, marginBottom: 8 }}>{stat.label}</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
              <span style={{ fontSize: 28, fontWeight: 800, fontFamily: fonts.display, color: colors.text }}>{stat.value}</span>
              <span style={{ fontSize: 14, fontWeight: 600, fontFamily: fonts.body, color: stat.color }}>{stat.change}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
};

const ChartMockup: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const progress = spring({ frame, fps, config: { damping: 15, mass: 2 } });
  const bars = [40, 65, 50, 80, 70, 90, 85, 95, 75, 88, 92, 100];

  return (
    <div
      style={{
        flex: 1,
        padding: 32,
        borderRadius: 20,
        background: colors.bgLight,
        border: `1px solid ${colors.bgLighter}`,
        opacity: interpolate(progress, [0, 1], [0, 1]),
      }}
    >
      <div style={{ fontSize: 16, fontWeight: 600, fontFamily: fonts.body, color: colors.textMuted, marginBottom: 24 }}>
        Vendas — Últimos 12 meses
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 12, height: 250 }}>
        {bars.map((h, i) => {
          const barProgress = spring({ frame: frame - 10 - i * 4, fps, config: { damping: 12 } });
          const barHeight = interpolate(barProgress, [0, 1], [0, h * 2.5]);
          return (
            <div
              key={i}
              style={{
                flex: 1,
                height: barHeight,
                borderRadius: 6,
                background: i === bars.length - 1
                  ? `linear-gradient(180deg, ${colors.primaryGlow}, ${colors.primary})`
                  : `linear-gradient(180deg, ${colors.primary}60, ${colors.primary}30)`,
                boxShadow: i === bars.length - 1 ? `0 0 20px ${colors.primary}40` : undefined,
              }}
            />
          );
        })}
      </div>
    </div>
  );
};

const BottomFeature: React.FC<{ icon: string; text: string }> = ({ icon, text }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const progress = spring({ frame, fps, config: { damping: 15 } });

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "16px 20px",
        borderRadius: 14,
        background: `${colors.bgLight}CC`,
        border: `1px solid ${colors.bgLighter}`,
        opacity: interpolate(progress, [0, 1], [0, 1]),
        transform: `translateY(${interpolate(progress, [0, 1], [15, 0])}px)`,
      }}
    >
      <span style={{ fontSize: 24 }}>{icon}</span>
      <span style={{ fontSize: 15, fontFamily: fonts.body, color: colors.text, fontWeight: 500 }}>{text}</span>
    </div>
  );
};
