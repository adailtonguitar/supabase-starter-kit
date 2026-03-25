import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { colors, fonts } from "../theme";

interface AnimatedTextProps {
  text: string;
  delay?: number;
  fontSize?: number;
  color?: string;
  fontWeight?: number;
  fontFamily?: string;
  letterSpacing?: number;
}

export const AnimatedText: React.FC<AnimatedTextProps> = ({
  text,
  delay = 0,
  fontSize = 64,
  color = colors.text,
  fontWeight = 700,
  fontFamily = fonts.display,
  letterSpacing = -1,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const chars = text.split("");

  return (
    <div style={{ display: "flex", overflow: "hidden" }}>
      {chars.map((char, i) => {
        const charDelay = delay + i * 2;
        const progress = spring({
          frame: frame - charDelay,
          fps,
          config: { damping: 20, stiffness: 200 },
        });
        const y = interpolate(progress, [0, 1], [60, 0]);
        const opacity = interpolate(progress, [0, 1], [0, 1]);

        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              fontSize,
              fontWeight,
              fontFamily,
              color,
              letterSpacing,
              transform: `translateY(${y}px)`,
              opacity,
              whiteSpace: char === " " ? "pre" : undefined,
            }}
          >
            {char}
          </span>
        );
      })}
    </div>
  );
};
