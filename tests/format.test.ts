import { describe, expect, it } from "vitest";
import { displayNumber } from "../src/lib/format";

describe("displayNumber", () => {
  it("groups large values and preserves up to three decimals", () => {
    expect(displayNumber(1000)).toBe("1,000");
    expect(displayNumber(1000000)).toBe("1,000,000");
    expect(displayNumber(273289)).toBe("273,289");
    expect(displayNumber(14980003)).toBe("14,980,003");
    expect(displayNumber(-12345.5)).toBe("-12,345.5");
    expect(displayNumber(1234567.1254)).toBe("1,234,567.125");
    expect(displayNumber(-0.0004)).toBe("0");
  });
});
