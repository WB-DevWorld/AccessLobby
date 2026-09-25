// This example's resource authorization belongs to the consumer, not the issuer.
export const mayViewPrivate = (personId, grants) => Boolean(personId) && grants.has(personId);
