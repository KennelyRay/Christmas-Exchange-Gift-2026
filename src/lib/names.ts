/** Case, accents, and spacing never make two names count as different. */
export function normalizeNamePart(value: string) {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export const fullNameOf = (firstName: string, lastName: string) => `${firstName} ${lastName}`;

/**
 * Compares the whole name rather than each part, because "Mary Ann | Cruz" and
 * "Mary | Ann Cruz" both display as the same person in the name picker.
 */
export const nameKeyOf = (firstName: string, lastName: string) =>
  normalizeNamePart(fullNameOf(firstName, lastName));

export type Family<T> = { key: string; label: string; members: T[] };

/** Groups in join order. A family is labelled by how its first member spelled the name. */
export function groupByFamily<T extends { familyKey: string; lastName: string }>(people: readonly T[]) {
  const families = new Map<string, Family<T>>();
  for (const person of people) {
    const family = families.get(person.familyKey);
    if (family) family.members.push(person);
    else families.set(person.familyKey, { key: person.familyKey, label: person.lastName, members: [person] });
  }
  return [...families.values()];
}
