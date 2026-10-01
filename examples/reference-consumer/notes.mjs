import { randomUUID } from 'node:crypto';

export class NoteError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

/** Disposable peer-owned data. Never uses central identity or organization roles as ownership. */
export class Notes {
  #items = new Map();

  list(owner) { return [...this.#items.values()].filter(note => note.owner === owner).map(({ owner: _, ...note }) => ({ ...note })).reverse(); }
  get(owner, id) {
    const note = this.#items.get(id);
    if (!note || note.owner !== owner) throw new NoteError(404, 'Only the account that owns a note can open it. The note may also have been deleted.');
    const { owner: _, ...value } = note;
    return { ...value };
  }
  #fields(title, body) {
    if (typeof title !== 'string' || typeof body !== 'string' || !title.trim() || title.length > 120 || body.length > 10000) {
      throw new NoteError(400, 'Use a title of 1–120 characters and a note of up to 10,000 characters.');
    }
    return { title: title.trim(), body };
  }
  create(owner, title, body) {
    const fields = this.#fields(title, body);
    if (!owner) throw new NoteError(401, 'Sign in to save notes.');
    if (this.#items.size >= 1000 || this.list(owner).length >= 50) throw new NoteError(409, 'This test app is full. Delete a note before saving another.');
    const id = randomUUID();
    this.#items.set(id, { id, owner, ...fields });
    return id;
  }
  update(owner, id, title, body) {
    this.get(owner, id); // Do not disclose validation details for another person's note.
    this.#items.set(id, { id, owner, ...this.#fields(title, body) });
  }
  delete(owner, id) { this.get(owner, id); this.#items.delete(id); }
}

const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const testNotesNotice = '<p class="muted">Test app: notes are private to your app account and stay on this server. Restarting the app erases all test notes. Do not put sensitive information here.</p>';
export const notesLogout = `<h2>Sign out</h2><p class="muted">Signing out of Enben keeps your shared AccessLobby sign-in active. The second option also ends the shared sign-in session. Other apps must process that sign-out to end their local sessions.</p><form method="post" action="/logout" class="actions"><button name="scope" value="current">Sign out of Enben</button><button name="scope" value="all">Sign out of AccessLobby and supported apps</button></form>`;
const fields = (title = '', body = '') => `<label for="note-title">Title</label><input id="note-title" name="title" maxlength="120" required value="${escape(title)}"><label for="note-body">Note</label><textarea id="note-body" name="body" maxlength="10000" rows="6">${escape(body)}</textarea>`;
export function notesList(items) {
  return `${testNotesNotice}<h2>New note</h2><form class="notes-form" method="post" action="/notes">${fields()}<button class="button-primary" type="submit">Save note</button></form><h2>Your notes</h2>${items.length ? `<ul class="note-list">${items.map(note => `<li><a class="note-link" href="/notes/${note.id}">${escape(note.title)}</a><p class="note-preview">${escape(note.body.slice(0, 160))}</p></li>`).join('')}</ul>` : '<p>You have no notes yet. Save your first one above.</p>'}${notesLogout}`;
}
export function noteEditor(note) {
  return `${testNotesNotice}<form class="notes-form" method="post" action="/notes/${note.id}">${fields(note.title, note.body)}<button class="button-primary" type="submit">Save changes</button></form><div class="actions"><a class="button" href="/notes">All notes</a><form method="post" action="/notes/${note.id}/delete"><button class="button-danger" type="submit">Delete note</button></form></div>`;
}
