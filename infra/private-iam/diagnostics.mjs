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
    realmImportFailed: /Failed to import|Error importing|Unable to import|File name \/ realm name mismatch/i.test(value),
    realmFileNameMismatch: /File name \/ realm name mismatch/i.test(value),
    augmentationStarted: /Updating the configuration|Changes detected in configuration|Quarkus augmentation/i.test(value),
    outOfMemory: /OutOfMemoryError|Cannot allocate memory|out of memory/i.test(value),
  };
}

// Keycloak's CLI can omit exception classes unless verbose mode is enabled.
// Preserve precise known causes and known Java types without publishing raw
// server messages, dynamic realm/file names, URLs or arbitrary class strings.
export function startupFailureEvidence(value) {
  const knownTypes = [
    'java.lang.IllegalStateException', 'java.lang.IllegalArgumentException', 'java.lang.NullPointerException',
    'java.lang.OutOfMemoryError', 'java.io.FileNotFoundException', 'java.nio.file.AccessDeniedException',
    'java.net.UnknownHostException', 'java.net.ConnectException', 'java.net.BindException',
    'javax.net.ssl.SSLHandshakeException', 'org.postgresql.util.PSQLException',
    'org.infinispan.commons.CacheConfigurationException', 'io.quarkus.runtime.configuration.ConfigurationException',
    'jakarta.persistence.PersistenceException', 'org.hibernate.exception.JDBCConnectionException',
    'liquibase.exception.DatabaseException', 'liquibase.exception.MigrationFailedException',
  ];
  const knownMessages = {
    realm_filename_mismatch: /File name \/ realm name mismatch/i,
    import_directory_missing: /Directory not found:|directory.*doesn.t exist/i,
    database_authentication_failed: /password authentication failed/i,
    hostname_required: /hostname.*(?:is not configured|required|must be provided)/i,
    https_key_material_required: /Key material not provided to setup HTTPS/i,
    bootstrap_admin_failed: /(?:Failed|Unable) to create.*(?:bootstrap|initial|temporary).*admin/i,
    address_in_use: /Address already in use/i,
    no_route: /No route to host|Network is unreachable/i,
    permission_denied: /Permission denied|Operation not permitted/i,
  };
  return {
    exceptionClasses: knownTypes.filter(type => value.includes(type)),
    knownCauses: Object.entries(knownMessages).filter(([, pattern]) => pattern.test(value)).map(([name]) => name),
    serverErrorCodes: [...new Set(value.match(/\b(?:KC-SERVICES[0-9]{4}|ISPN[0-9]{6}|HHH[0-9]{6})\b/g) || [])].slice(0, 16),
  };
}

// The `compose run --rm ... -t` container can disappear before inspection.
// Classify its captured command stderr immediately; retain no raw text/path.
export function nginxFailureEvidence(value) {
  return {
    stderrReopenFailed: /open\(\).*\/dev\/stderr.*failed|could not open.*\/dev\/stderr/i.test(value),
    defaultLogOpenFailed: /(?:could not open error log file|open\(\).*\/(?:var\/log\/nginx|logs)\/error\.log.*failed)/i.test(value),
    configFileOpenFailed: /open\(\).*\/etc\/nginx\/nginx\.conf.*failed/i.test(value),
    mimeTypesOpenFailed: /open\(\).*mime\.types.*failed/i.test(value),
    tempPathOperationFailed: /(?:mkdir|chown|open)\(\).*\/(?:tmp\/(?:client_body|proxy|fastcgi|uwsgi|scgi)|var\/cache\/nginx).*failed/i.test(value),
    pidFileOpenFailed: /open\(\).*nginx\.pid.*failed/i.test(value),
    tlsKeyLoadFailed: /cannot load certificate key|SSL_CTX_use_PrivateKey|key values mismatch/i.test(value),
    tlsCertificateLoadFailed: /cannot load certificate[ :]|SSL_CTX_use_certificate|PEM_read_bio_X509/i.test(value),
    upstreamResolutionFailed: /host not found in upstream|no resolver defined|upstream.*could not be resolved/i.test(value),
    userOrGroupSwitchFailed: /(?:setuid|setgid|setgroups|initgroups)\(\).*failed/i.test(value),
    syntaxRejected: /unknown directive|invalid (?:number|value|parameter|condition)|unexpected ["'};]|directive.*(?:not allowed|not terminated)|duplicate.*directive/i.test(value),
    configurationTestFailed: /configuration file.*test failed/i.test(value),
    configurationTestSuccessful: /configuration file.*test is successful/i.test(value),
    mountFailed: /error mounting|failed to mount|invalid mount config/i.test(value),
    readOnlyFilesystem: /Read-only file system/i.test(value),
    imageUnavailable: /pull access denied|No such image|unable to find image|invalid reference format/i.test(value),
  };
}

export function commandFailureEvidence(error) {
  const value = String(error?.stdout || '').slice(0, 262144) + '\n' + String(error?.stderr || '').slice(0, 262144);
  return { exitCode: Number.isInteger(error?.code) && error.code >= 0 && error.code <= 255 ? error.code : null,
    logCategories: logCategories(value), startupFailure: startupFailureEvidence(value), nginx: nginxFailureEvidence(value),
    cli: {
      ttyUnavailable: /input device is not a TTY|cannot enable tty mode|not a terminal/i.test(value),
      unknownFlag: /unknown flag|unknown shorthand flag|flag provided but not defined/i.test(value),
      composeConfigurationInvalid: /validating .*compose|additional propert|must be a (?:mapping|list|number|string)|invalid compose project/i.test(value),
      composeFileReadFailed: /(?:open|read).*compose\.json.*(?:permission denied|no such file)|compose\.json.*(?:permission denied|no such file)/i.test(value),
      daemonUnavailable: /Cannot connect to the Docker daemon|error during connect|docker daemon is not running/i.test(value),
      runtimeCreateFailed: /OCI runtime create failed|failed to create (?:task|shim)|unable to start container process/i.test(value),
      executableMissing: /executable file not found|exec format error/i.test(value),
      imageResolutionFailed: /pull access denied|failed to (?:pull|resolve).*image|No such image|manifest.*not found|invalid reference format/i.test(value),
    } };
}

// Only for this disposable, credential-free `nginx -t` invocation. No caller
// may use this to retain authenticated browser/server output or generic logs.
export function disposableConfigDiagnostic(error, knownPrivateValues = []) {
  let value = String(error?.stderr || '').slice(0, 16384) + '\n' + String(error?.stdout || '').slice(0, 16384);
  value = value.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').replace(/[^\x09\x0a\x0d\x20-\x7e]/g, '');
  for (const privateValue of knownPrivateValues) {
    if (typeof privateValue === 'string' && privateValue.length) value = value.split(privateValue).join('[private]');
  }
  return value.split(/\r?\n/).filter(line => line.trim()).slice(0, 12).map(line => {
    if (/\b(?:authorization|password|passwd|secret|token|cookie|credentials?|smtp)\b|private[ _-]?key|-----BEGIN/i.test(line)) return '[sensitive line omitted]';
    return line
      .replace(/[a-z][a-z0-9+.-]*:\/\/[^\s"'<>]+/gi, '[url]')
      .replace(/\b[A-Z][A-Z0-9_]{2,}=(?:"[^"]*"|'[^']*'|[^\s]+)/g, '[environment]')
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
      .replace(/(?:[A-Za-z]:)?\/(?:[^\s"'<>]+)/g, '[path]')
      .replace(/["'][^"']*["']/g, '[value]')
      .replace(/\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/g, '[ip]')
      .replace(/[A-Za-z0-9+_=.\/-]{24,}/g, '[opaque]')
      .slice(0, 240);
  });
}
