export function isPublicRegistrationEnabled(value = process.env.PUBLIC_REGISTRATION_ENABLED) {
  return value?.trim().toLowerCase() === 'true';
}

export const productFeatures = {
  recovery: {
    state: 'planned',
    title: 'Recovery options are coming',
    description:
      'Trusted contacts, backup codes, passkeys and device recovery are not available in this release.',
  },
  security: {
    state: 'planned',
    title: 'Security controls are planned',
  },
  appsAccess: {
    state: 'planned',
    title: 'Connected apps are planned',
  },
  privacy: {
    state: 'planned',
    title: 'Privacy controls are planned',
  },
} as const;
