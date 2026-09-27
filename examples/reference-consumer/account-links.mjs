import { randomUUID } from 'node:crypto';

/** Peer-owned mapping. Real consumers persist this with unique database constraints and audit records. */
export class AccountLinks {
  #bySubject = new Map();
  #byLocal = new Map();

  find(issuer, subject, personId) {
    const match = this.#bySubject.get(JSON.stringify([issuer, subject]));
    if (match && match.personId !== personId) throw new Error('Conflicting AccessLobby person');
    return match?.localUserId ?? null;
  }

  link(issuer, subject, personId, localUserId) {
    if (!issuer || !subject || !personId || !localUserId) throw new Error('Incomplete account link');
    const key = JSON.stringify([issuer, subject]);
    const subjectLink = this.#bySubject.get(key);
    const localLink = this.#byLocal.get(localUserId);
    if ((subjectLink && (subjectLink.localUserId !== localUserId || subjectLink.personId !== personId)) ||
        (localLink && (localLink.key !== key || localLink.personId !== personId))) {
      throw new Error('Conflicting account link');
    }
    this.#bySubject.set(key, { localUserId, personId });
    this.#byLocal.set(localUserId, { key, personId });
    return localUserId;
  }

  join(issuer, subject, personId) {
    const existing = this.find(issuer, subject, personId);
    if (existing) return existing;
    return this.link(issuer, subject, personId, randomUUID());
  }
}
