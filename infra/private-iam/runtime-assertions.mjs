// Docker/Compose may return Linux capability names with or without CAP_.
// Canonicalize only that prefix; never discard extras/duplicates or case-fold.
export function canonicalCapabilities(values) {
  if (!Array.isArray(values) || values.some(value => typeof value !== 'string' || !/^(?:CAP_)?[A-Z][A-Z0-9_]*$/.test(value))) {
    throw new Error('invalid_capability_representation');
  }
  return values.map(value => value.replace(/^CAP_/, '')).sort();
}
