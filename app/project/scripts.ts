// Script names (docs/0006-script-management.md decision 1).
import { nameError } from "../home/project.ts";

/** Sorts by name with numbers in order: Heist, Heist 2, Heist 10. */
export const byName = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });

/** Error message for a script name, or null when it is fine. `taken` are the other scripts' names. */
export function scriptNameError(raw: string, taken: string[]): string | null {
  const bad = nameError(raw);
  if (bad) return bad;
  const name = raw.trim().toLowerCase();
  // macOS and Windows treat Heist and heist as one file.
  const hit = taken.find((t) => t.toLowerCase() === name);
  return hit ? `A script called ${hit} already exists.` : null;
}
