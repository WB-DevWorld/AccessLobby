export function publicRegistrationEnabled(value = process.env.PUBLIC_REGISTRATION_ENABLED) {
  return String(value || '').trim().toLowerCase() === 'true';
}
