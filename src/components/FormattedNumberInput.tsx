import { useEffect, useState } from "react";
import { displayNumber } from "../lib/format";
import { parseNumberInput } from "../lib/numberInput";

export type FormattedNumberInputProps = {
  value: number | null;
  disabled?: boolean;
  onChange: (value: number | null) => void;
  className?: string;
  id?: string;
  name?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
};

function inputValue(value: number | null) {
  return value !== null && Number.isFinite(value) ? displayNumber(value) : "";
}

function editingValue(value: number | null) {
  return value !== null && Number.isFinite(value) ? String(value) : "";
}

export function FormattedNumberInput({
  value,
  disabled = false,
  onChange,
  className,
  id,
  name,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledby,
}: FormattedNumberInputProps) {
  const [focused, setFocused] = useState(false);
  const [buffer, setBuffer] = useState(() => inputValue(value));

  useEffect(() => {
    if (!focused) setBuffer(inputValue(value));
  }, [focused, value]);

  function handleFocus() {
    setFocused(true);
    setBuffer(editingValue(value));
  }

  function handleChange(nextBuffer: string) {
    const parsed = parseNumberInput(nextBuffer);
    if (parsed.kind === "invalid") return;

    const nextDisplayBuffer = parsed.kind === "value" ? nextBuffer.replaceAll(",", "") : nextBuffer;
    setBuffer(nextDisplayBuffer);
    if (parsed.kind === "empty") onChange(null);
    if (parsed.kind === "value") onChange(parsed.value);
  }

  function handleBlur() {
    const parsed = parseNumberInput(buffer);
    if (parsed.kind === "value") {
      if (parsed.value !== value) onChange(parsed.value);
      setBuffer(inputValue(parsed.value));
    } else if (parsed.kind === "empty") {
      if (value !== null) onChange(null);
      setBuffer("");
    } else {
      setBuffer(inputValue(value));
    }
    setFocused(false);
  }

  return <input
    id={id}
    name={name}
    className={className}
    type="text"
    inputMode="decimal"
    value={buffer}
    disabled={disabled}
    aria-label={ariaLabel}
    aria-labelledby={ariaLabelledby}
    onFocus={handleFocus}
    onChange={event => handleChange(event.target.value)}
    onBlur={handleBlur}
  />;
}
