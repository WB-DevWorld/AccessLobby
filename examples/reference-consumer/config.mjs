export function publicRegistrationEnabled(value = process.env.PUBLIC_REGISTRATION_ENABLED) {
  return String(value || '').trim().toLowerCase() === 'true';
}
export function appEntryRequired(value = process.env.APP_ENTRY_REQUIRED) {
  return String(value || '').trim().toLowerCase() === 'true';
}
export function notesEnabled(value = process.env.NOTES_ENABLED) {
  return String(value || '').trim().toLowerCase() === 'true';
}
