export type NumberInputParseResult =
  | { kind: "empty" }
  | { kind: "incomplete" }
  | { kind: "invalid" }
  | { kind: "value"; value: number };

const UNGROUPED_NUMBER = /^-?(?:\d+)(?:\.\d+)?$|^-?\.\d+$/;
const GROUPED_NUMBER = /^-?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/;
const INCOMPLETE_NUMBER = /^-?$|^-?(?:\d+)?\.$/;

export function parseNumberInput(input: string): NumberInputParseResult {
  if (input === "") return { kind: "empty" };
  if (INCOMPLETE_NUMBER.test(input)) return { kind: "incomplete" };
  if (!UNGROUPED_NUMBER.test(input) && !GROUPED_NUMBER.test(input)) return { kind: "invalid" };

  const value = Number(input.replaceAll(",", ""));
  return Number.isFinite(value) ? { kind: "value", value } : { kind: "invalid" };
}
