import { readFileSync } from "node:fs";
import { InvalidArgumentError } from "@commander-js/extra-typings";

export function boundedInteger(
  value: string,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
) {
  if (!/^\d+$/.test(value))
    throw new InvalidArgumentError("Expected an integer");
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max)
    throw new InvalidArgumentError(`Expected an integer from ${min} to ${max}`);
  return number;
}

export function integer(value: string) {
  return boundedInteger(value);
}

export function pageSize(value: string) {
  return boundedInteger(value, 1, 100);
}

export function choice<T extends string>(values: readonly T[]) {
  return (value: string): T => {
    if (!values.includes(value as T))
      throw new InvalidArgumentError(`Expected one of: ${values.join(", ")}`);
    return value as T;
  };
}

export function readText(options: {
  text?: string;
  file?: string;
  stdin?: boolean;
}) {
  if (
    [
      options.text !== undefined,
      options.file !== undefined,
      !!options.stdin,
    ].filter(Boolean).length !== 1
  )
    throw new Error("Provide exactly one of --text, --file, or --stdin");
  return (
    options.text ?? readFileSync(options.stdin ? 0 : options.file!, "utf8")
  );
}

export function decodeCursor(value?: string) {
  if (!value) return undefined;
  try {
    const cursor = JSON.parse(
      Buffer.from(value, "base64").toString(),
      (key, item) => (key === "createdAt" ? new Date(item) : item),
    );
    if (!cursor || typeof cursor !== "object" || Array.isArray(cursor))
      throw new Error();
    return cursor;
  } catch {
    throw new Error(
      "Invalid cursor: use the nextCursor returned by this command",
    );
  }
}

export function encodeCursor(value: unknown) {
  return value
    ? Buffer.from(JSON.stringify(value)).toString("base64")
    : undefined;
}
