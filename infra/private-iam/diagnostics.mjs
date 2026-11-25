// Only fixed categories leave this module. Never return raw exception/log text.
export function errorCategory(error) {
  const code = error?.code;
  if (code === 'ERR_ASSERTION') return 'assertion_failed';
  if (['ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT', 'ENOENT', 'ENOMEM'].includes(code)) return code.toLowerCase();
  if (['DEPTH_ZERO_SELF_SIGNED_CERT', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'ERR_TLS_CERT_ALTNAME_INVALID', 'CERT_HAS_EXPIRED'].includes(code)) return 'tls_certificate_rejected';
  if (error?.category && ['command_timeout', 'command_exit_nonzero', 'command_unavailable'].includes(error.category)) return error.category;
  return 'assertion_or_prerequisite_failed';
}

export function logCategories(value) {
  return {
    ready: /Listening on:|Keycloak .* started|ready to accept connections|start worker processes/i.test(value),
    databaseAuthenticationFailed: /password authentication failed|authentication failed for user/i.test(value),
    databaseConnectionFailed: /Unable to acquire JDBC connection|Connection to .* refused|failed to obtain.*connection|JDBC.*(error|exception)/i.test(value),
    nameResolutionFailed: /UnknownHostException|Name or service not known|host not found in upstream|could not translate host name/i.test(value),
    permissionDenied: /permission denied|Operation not permitted/i.test(value),
    tlsConfigurationFailed: /cannot load certificate|SSL_CTX_use|PEM_read_bio|key values mismatch/i.test(value),
    serverStartupFailed: /Failed to start server|failed to start|\[emerg\]|FATAL:/i.test(value),
    configurationRejected: /Unknown option|Unmatched argument|Invalid value for|Failed to validate|ERROR:.*configuration/i.test(value),
    realmImportFailed: /Failed to import|Error importing|Unable to import/i.test(value),
    augmentationStarted: /Updating the configuration|Changes detected in configuration|Quarkus augmentation/i.test(value),
    outOfMemory: /OutOfMemoryError|Cannot allocate memory|out of memory/i.test(value),
  };
}
