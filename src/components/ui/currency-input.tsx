import React, { useState, useCallback, useRef, useEffect } from "react";
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

function parseDecimalValue(raw: string): number {
  if (!raw || raw.trim() === "") return 0;
  // Remove thousand separators (dots), replace comma with dot for parsing
  const cleaned = raw.replace(/\./g, "").replace(",", ".");
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function formatDisplayValue(value: number): string {
  if (value === 0) return "0,00";
  return formatBRL(Math.round(value * 100));
}

export function CurrencyInput({ value, onChange, placeholder, className, name, onBlur }: CurrencyInputProps) {
  const numValue = typeof value === "string" ? parseFloat(value || "0") : (value || 0);
  const [display, setDisplay] = useState(() => formatDisplayValue(numValue));
  const [isFocused, setIsFocused] = useState(false);
  const lastExternalValue = useRef(numValue);

  // Sync display when external value changes (but not while user is typing)
  useEffect(() => {
    if (!isFocused && numValue !== lastExternalValue.current) {
      lastExternalValue.current = numValue;
      setDisplay(formatDisplayValue(numValue));
    }
  }, [value, isFocused, numValue]);

  const handleFocus = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(true);
    // Show raw number for easier editing
    const num = typeof value === "string" ? parseFloat(value || "0") : (value || 0);
    if (num === 0) {
      setDisplay("");
    } else {
      // Show without thousand separators, with comma decimal
      const parts = num.toFixed(2).split(".");
      setDisplay(`${parts[0]},${parts[1]}`);
    }
    // Select all text for easy replacement
    setTimeout(() => e.target.select(), 0);
  }, [value]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    // Allow digits, comma, dot, and minus
    const filtered = raw.replace(/[^0-9.,-]/g, "");
    setDisplay(filtered);
    const parsed = parseDecimalValue(filtered);
    lastExternalValue.current = parsed;
    onChange(parsed);
  }, [onChange]);

  const handleBlur = useCallback(() => {
    setIsFocused(false);
    const parsed = parseDecimalValue(display);
    lastExternalValue.current = parsed;
    setDisplay(formatDisplayValue(parsed));
    onChange(parsed);
    onBlur?.();
  }, [display, onChange, onBlur]);

  return (
    <Input
      type="text"
      inputMode="decimal"
      placeholder={placeholder || "0,00"}
      value={display}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      name={name}
      className={className}
    />
  );
}
