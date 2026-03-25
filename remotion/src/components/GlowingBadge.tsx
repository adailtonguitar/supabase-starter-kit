import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { colors, fonts } from "../theme";

interface GlowingBadgeProps {
  text: string;
  delay?: number;
}

export const GlowingBadge: React.FC<GlowingBadgeProps> = ({ text, delay = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame: frame - delay,
    fps,
    config: { damping: 20, stiffness: 200 },
  });

  const scale = interpolate(progress, [0, 1], [0.5, 1]);
  const opacity = interpolate(progress, [0, 1], [0, 1]);
  const pulseGlow = interpolate(
    Math.sin(frame * 0.08),
    [-1, 1],
    [0.3, 0.6]
  );

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 24px",
        borderRadius: 100,
        background: `${colors.primary}18`,
        border: `1px solid ${colors.primary}40`,
        boxShadow: `0 0 30px ${colors.primary}${Math.round(pulseGlow * 255).toString(16).padStart(2, "0")}`,
        transform: `scale(${scale})`,
        opacity,
      }}
    >
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          backgroundColor: colors.primary,
          boxShadow: `0 0 10px ${colors.primary}`,
        }}
      />
      <span
        style={{
          fontSize: 16,
          fontWeight: 600,
          fontFamily: fonts.body,
          color: colors.primaryGlow,
          letterSpacing: 1,
          textTransform: "uppercase",
        }}
      >
        {text}
      </span>
    </div>
  );
};
