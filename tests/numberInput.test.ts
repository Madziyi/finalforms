import { describe, expect, it } from "vitest";
import { parseNumberInput } from "../src/lib/numberInput";

function parsedValue(input: string) {
  const result = parseNumberInput(input);
  expect(result.kind).toBe("value");
  return result.kind === "value" ? result.value : undefined;
}

describe("parseNumberInput", () => {
  it("parses ordinary and grouped numeric readings", () => {
    expect(parsedValue("273289")).toBe(273289);
    expect(parsedValue("273289.5")).toBe(273289.5);
    expect(parsedValue("-1234.5")).toBe(-1234.5);
    expect(parsedValue("273,289.5")).toBe(273289.5);
  });

  it("rejects malformed grouping and invalid numeric text", () => {
    for (const input of ["27,32,89", "x1,000", "letters", "12a", "--1", "1.2.3", "Infinity", "NaN"]) {
      expect(parseNumberInput(input).kind).toBe("invalid");
    }
  });

  it("recognizes incomplete editing states without producing a number", () => {
    for (const input of ["-", ".", "-.", "12."]) {
      expect(parseNumberInput(input).kind).toBe("incomplete");
    }
  });

  it("maps an empty input to empty and never returns a non-finite value", () => {
    expect(parseNumberInput("")).toEqual({ kind: "empty" });
    for (const input of ["0", "-0", "0.0001", "999,999,999.999"]) {
      const result = parseNumberInput(input);
      if (result.kind === "value") expect(Number.isFinite(result.value)).toBe(true);
    }
  });
});
