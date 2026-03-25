import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { colors, fonts } from "../theme";

interface FeatureCardProps {
  icon: string;
  title: string;
  description: string;
  delay: number;
  x: number;
  y: number;
  width?: number;
}

export const FeatureCard: React.FC<FeatureCardProps> = ({
  icon,
  title,
  description,
  delay,
  x,
  y,
  width = 380,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame: frame - delay,
    fps,
    config: { damping: 15, stiffness: 150 },
  });

  const scale = interpolate(progress, [0, 1], [0.8, 1]);
  const opacity = interpolate(progress, [0, 1], [0, 1]);
  const translateY = interpolate(progress, [0, 1], [30, 0]);

  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width,
        transform: `scale(${scale}) translateY(${translateY}px)`,
        opacity,
        background: `linear-gradient(135deg, ${colors.bgLight}, ${colors.bgLighter})`,
        borderRadius: 20,
        padding: 32,
        border: `1px solid ${colors.primary}30`,
        boxShadow: `0 20px 60px ${colors.bg}80`,
      }}
    >
      <div
        style={{
          fontSize: 48,
          marginBottom: 16,
        }}
      >
        {icon}
      </div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 700,
          fontFamily: fonts.display,
          color: colors.text,
          marginBottom: 8,
        }}
      >
        {title}
      </div>
      <div
        style={{
          fontSize: 15,
          fontFamily: fonts.body,
          color: colors.textMuted,
          lineHeight: 1.5,
        }}
      >
        {description}
      </div>
    </div>
  );
};
