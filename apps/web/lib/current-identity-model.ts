export type CurrentPerson = Readonly<{
  id: string;
  status: string;
}>;

export type CurrentIdentityResult =
  | Readonly<{ state: 'ready'; person: CurrentPerson }>
  | Readonly<{ state: 'signed-out' }>
  | Readonly<{ state: 'restricted' }>
  | Readonly<{ state: 'unavailable' }>;

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseCurrentPersonResponse(value: unknown): CurrentPerson | null {
  if (!isRecord(value) || !isRecord(value.person)) return null;

  const id = value.person.id;
  const status = value.person.status;

  if (typeof id !== 'string' || id.trim().length === 0) return null;
  if (typeof status !== 'string' || status.trim().length === 0) return null;

  return { id: id.trim(), status: status.trim() };
}

export function formatIdentityStatus(status: string): string {
  return status
    .trim()
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}
