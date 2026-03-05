import { useState, useEffect, useRef } from "react";

export function useCountUp(end: number, duration = 800, decimals = 0): number {
  const [value, setValue] = useState(0);
  const startTime = useRef<number | null>(null);
  const animFrame = useRef<number>(0);

  useEffect(() => {
    if (end === 0) { setValue(0); return; }
    startTime.current = null;

    const animate = (ts: number) => {
      if (!startTime.current) startTime.current = ts;
      const progress = Math.min((ts - startTime.current) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      setValue(parseFloat((eased * end).toFixed(decimals)));
      if (progress < 1) animFrame.current = requestAnimationFrame(animate);
    };

    animFrame.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animFrame.current);
  }, [end, duration, decimals]);

  return value;
}
