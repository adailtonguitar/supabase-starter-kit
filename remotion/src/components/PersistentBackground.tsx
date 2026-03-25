import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { colors } from "../theme";

export const PersistentBackground: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  // Slow-moving gradient orbs
  const orb1X = interpolate(frame, [0, durationInFrames], [10, 60]);
  const orb1Y = interpolate(frame, [0, durationInFrames], [20, 80]);
  const orb2X = interpolate(frame, [0, durationInFrames], [80, 30]);
  const orb2Y = interpolate(frame, [0, durationInFrames], [70, 20]);

  return (
    <AbsoluteFill>
      {/* Base gradient */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `linear-gradient(135deg, ${colors.bg} 0%, ${colors.bgLight} 50%, ${colors.bg} 100%)`,
        }}
      />
      {/* Orb 1 - teal */}
      <div
        style={{
          position: "absolute",
          width: 600,
          height: 600,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${colors.primary}15, transparent 70%)`,
          left: `${orb1X}%`,
          top: `${orb1Y}%`,
          transform: "translate(-50%, -50%)",
          filter: "blur(80px)",
        }}
      />
      {/* Orb 2 - blue */}
      <div
        style={{
          position: "absolute",
          width: 500,
          height: 500,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${colors.accent}12, transparent 70%)`,
          left: `${orb2X}%`,
          top: `${orb2Y}%`,
          transform: "translate(-50%, -50%)",
          filter: "blur(60px)",
        }}
      />
      {/* Grid overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.03,
          backgroundImage: `linear-gradient(${colors.text} 1px, transparent 1px), linear-gradient(90deg, ${colors.text} 1px, transparent 1px)`,
          backgroundSize: "60px 60px",
        }}
      />
    </AbsoluteFill>
  );
};
