import React, { useState, useCallback, useRef } from "react";
import { Input } from "@/components/ui/input";

interface CurrencyInputProps {
  value: number | string;
  onChange: (value: number) => void;
  placeholder?: string;
  className?: string;
  name?: string;
  onBlur?: () => void;
}

export function formatBRL(cents: number): string {
  const abs = Math.abs(cents);
  const intPart = Math.floor(abs / 100);
  const decPart = String(abs % 100).padStart(2, "0");
  const formatted = intPart.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${cents < 0 ? "-" : ""}${formatted},${decPart}`;
}

export function formatDecimalBRL(value: number): string {
  return formatBRL(Math.round(value * 100));
}

function parseToCents(raw: string): number {
  const digits = raw.replace(/\D/g, "");
  return parseInt(digits || "0", 10);
}

export function CurrencyInput({ value, onChange, placeholder, className, name, onBlur }: CurrencyInputProps) {
  const numValue = typeof value === "string" ? Math.round(parseFloat(value || "0") * 100) : Math.round((value || 0) * 100);
  const lastCents = useRef(numValue);
  const [display, setDisplay] = useState(() => formatBRL(numValue));

  React.useEffect(() => {
    const newCents = typeof value === "string" ? Math.round(parseFloat(value || "0") * 100) : Math.round((value || 0) * 100);
    if (newCents !== lastCents.current) {
      lastCents.current = newCents;
      setDisplay(formatBRL(newCents));
    }
  }, [value]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const cents = parseToCents(raw);
    lastCents.current = cents;
    setDisplay(formatBRL(cents));
    onChange(cents / 100);
  }, [onChange]);

  return (
    <Input
      type="text"
      inputMode="numeric"
      placeholder={placeholder || "0,00"}
      value={display}
      onChange={handleChange}
      onBlur={onBlur}
      name={name}
      className={className}
    />
  );
}
