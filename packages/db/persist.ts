import type { KarakeepDB } from "./libraryStore";
import { getLibraryStore } from "./libraryStore";

/**
 * Persist functions are the named, database-only units of work that
 * background jobs hand to the library store (ADR 0011). On the Docker target
 * they run in the job's own process; on the Cloudflare target, jobs running
 * in Containers will send them to the Durable Object that owns the store.
 *
 * Inputs and results must be plain JSON so both targets behave the same.
 */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue | undefined };

export type PersistFunction<I extends JsonValue, O extends JsonValue | void> = (
  db: KarakeepDB,
  input: I,
) => Promise<O>;

const registry = new Map<string, PersistFunction<never, JsonValue | void>>();

/**
 * Registers a persist function under a unique name and returns the function
 * jobs call. Each persist function opens its own transaction.
 */
export function definePersist<I extends JsonValue, O extends JsonValue | void>(
  name: string,
  fn: PersistFunction<I, O>,
): (input: I) => Promise<O> {
  if (registry.has(name)) {
    throw new Error(`Persist function "${name}" is already registered.`);
  }
  registry.set(name, fn as PersistFunction<never, JsonValue | void>);
  return (input) => runPersist(name, input) as Promise<O>;
}

/** Looks up a registered persist function, for runtimes that receive calls. */
export function getPersistFunction(
  name: string,
): PersistFunction<JsonValue, JsonValue | void> | undefined {
  return registry.get(name) as
    | PersistFunction<JsonValue, JsonValue | void>
    | undefined;
}

// JSON round-trips mirror what crossing a process boundary does, so a value
// that would not survive it (Date, Buffer, Set, undefined in arrays) fails or
// changes here too instead of only after deploying to Cloudflare.
function roundTrip<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

/** Runs a registered persist function against the bound library store. */
export async function runPersist(
  name: string,
  input: JsonValue,
): Promise<JsonValue | void> {
  const fn = getPersistFunction(name);
  if (!fn) throw new Error(`Unknown persist function "${name}".`);
  return roundTrip(await fn(getLibraryStore().db, roundTrip(input)));
}
