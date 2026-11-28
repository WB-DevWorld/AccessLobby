# Host-local IAM certificate materialization

This optional follow-up supplies regular PEM files for the [existing private-console renderer](private-iam-console.md) when the host's existing Traefik manager stores the approved IAM certificate only in ACME JSON. It does not deploy the console, change a realm or request a certificate. The five-feature AccessLobby release is independent of this follow-up.

The private key must remain on its existing operator host, outside workspaces, Git, logs and uploaded evidence. The existing owner authorization for private IAM setup applies through the approved host route; source qualification and protected path/format readback must precede the narrow host operation. The current Cursor restriction against ACME JSON export is superseded **only after this tool's source, cryptographic tests and independent security review are qualified**, and only for the exact host-local certificate/key materialization described here. Exporting the account, whole store, unrelated keys or a key to a workstation remains excluded.

## Preconditions

- Use the established protected host account and the already approved canonical IAM origin. A root-owned0600 ACME store requires the authorized root operator; do not change its owner or permissions. The tool also supports effective-user-owned0400/0600 stores for protected nonroot operation and local fixtures.
- Confirm the running manager uses the supported Traefik JSON shape: resolver names containing `Account` and `Certificates`; each certificate has `domain.main`, optional `domain.sans`, base64 `certificate` and `key`, and optional `Store`. Unknown schemas fail closed. No manager API, second Traefik instance, ACME account or public administration route is introduced.
- Select a new absolute output directory beneath an existing trusted parent on the same host, outside any repository or workspace. The tool creates this directory; it must not already exist. No path component may be a symlink. The output is0700 with0600 regular files owned by the executing account, which is root during actual root-store operation.
- Normal system roots must validate the selected chain. An existing, explicitly approved CA bundle may be supplied with `--ca-file`; a test CA is never a reason to change live browser trust. Never disable certificate verification or copy an account key to satisfy this prerequisite.

## Narrow operation

Run the reviewed source through the authorized host route. Keep `materialize-certificate.py`, `manager_source.py` and `render.py` together from the same qualified commit in a protected host-local tooling directory. Do not mix revisions. These are nonsecret placeholders, not evidence of executed host commands:

```text
python3 infra/private-iam/materialize-certificate.py \
  --source /PROTECTED_EXISTING_MANAGER/acme.json \
  --canonical-origin https://APPROVED_CANONICAL_IAM_HOST \
  --output-directory /PROTECTED_NEW_DIRECTORY/iam-certificate-YYYYMMDD
```

Only if already approved, append `--ca-file /PROTECTED_APPROVED_CA_BUNDLE`. Do not use shell tracing, print the input file, record command substitutions containing keys, or copy the resulting PEM into a workspace. The Python API is `materialize(source, canonical_origin, output_directory, ca_file=None)`; its result and CLI output contain fixed categorical checks and the two generic filenames, with no certificate, host, account, fingerprint or key values.

The adapter opens the source read-only using no-follow file descriptors, checks regular-file status, single-link ownership and exact protected modes, and limits it to4MiB. It compares two complete reads and file identity/size/timestamp observations, with three bounded attempts for an in-place writer. Duplicate JSON keys, malformed data and unsupported schemas are refused. It requires one exact hostname candidate across all resolvers; matching wildcard candidates and ambiguous duplicates are refused. Only that candidate's certificate and private key are decoded. The ACME account and other certificates/keys are never decoded into output or supplied to OpenSSL.

The two files are created exclusively as `fullchain.pem` and `privkey.pem`. The existing renderer's validation remains unchanged: OpenSSL checks key matching, server-chain trust, hostname and current validity, with at least24hours remaining. The adapter additionally requires the exact hostname in DNS SANs and accepts only a complete DNS-only SAN display; wildcard, URI, IP and unparsed SAN entries are refused. Text inside another SAN type cannot satisfy the DNS requirement through common-name fallback. No network request, trust-store modification or validity bypass is used. A final consistent source read must still match the initial bytes before success.

Success reports `materialized:true` and `deployed:false`. The source is never opened for writing. A changing or partial store results in bounded retry or refusal, rather than acceptance of an incomplete snapshot. Repeated refusal needs operator investigation of the existing manager, without editing its account or certificate store.

On failure, cleanup removes only files whose recorded device/inode still identify objects created by this invocation, then its own empty directory. Existing paths are never overwritten. Unexpected or replaced objects are preserved and produce `owned_partial_cleanup_incomplete`; investigate that protected directory manually instead of recursively deleting it. Error output uses fixed categories and does not forward OpenSSL stderr or exception strings.

## Existing manager source when the host ancestry is unsafe

The default `--source` operation continues to refuse any unsafe writable ancestor, even when the leaf is root-owned0600. Do not change permissions on a shared deployment directory, copy the store to another pathname or hide it behind a new mount to satisfy this check.

An explicit root-only alternative can use the existing **local Docker manager's already-bound filesystem**. First inspect only nonsecret identity and mount metadata through the established operator route. Confirm the exact full64-character running container ID, its existing bind destination and the manager's actual storage path. Do not print container environment, arguments, logs or store contents. Names, ID prefixes, remote Docker contexts, arbitrary file descriptors and caller-supplied trust assertions are not accepted.

```text
python3 /PROTECTED_TOOLING/materialize-certificate.py \
  --manager-container-id FULL_64_CHARACTER_EXISTING_MANAGER_ID \
  --manager-storage-path /EXISTING_MANAGER_BIND/acme.json \
  --canonical-origin https://APPROVED_CANONICAL_IAM_HOST \
  --output-directory /PROTECTED_NEW_DIRECTORY/iam-certificate-YYYYMMDD
```

Use either `--source` or the two manager arguments. All output protection, exact certificate selection, crypto checks and same-host restrictions above still apply. This mode does not require or create a new mount, container, helper service or namespace privilege. It does not execute commands inside the manager or stream/copy its full certificate store. The Python API is `materialize_manager(container_id, storage_path, canonical_origin, output_directory, ca_file=None)`.

The reader uses the protected local `/run/docker.sock` explicitly and inspects only container identity, image, restart/process state and mounts. Kernel process/cgroup evidence must confirm that the running PID belongs to the exact selected container. Pinned process and root descriptors, process start time, mount namespace and kernel mount IDs tie the existing bind mapping to the opened file. Every component below that root must be protected, root owned and free of symlinks. The regular single-link source must be0400/0600. The host's unsafe source ancestry is never reopened or waived: the existing manager bind root and its protected container-side ancestry are the separate trust anchor.

The current path, bind root, mount and leaf are checked again around stable reads and after real cryptographic validation. A restart, changed namespace/mapping, covering mount or even an identical-byte atomic leaf replacement refuses the operation and cleans only its owned output. Unsupported cgroup/mount layout, a non-bind storage path, missing process permissions or unsafe container-side ancestry remains a blocker. Do not weaken the checks or invent an unqualified fallback. A fresh invocation after an ordinary manager change must establish a new complete baseline.

Successful synthetic CI establishes the implementation's checks, not compatibility with the operator host. Record only categorical outcomes from actual host execution. The original manager/store must remain unchanged, and private-console acceptance is still required separately.

## Private-console handoff and renewal

Use the resulting protected file paths as the existing renderer's `--certificate` and `--private-key` inputs, with a different new directory for its generated Compose package. Follow [private-console preflight, native acceptance and rollback](private-iam-console.md) unchanged. Materialization alone does not prove the host listener, tunnel, authenticated console or realm/client controls work.

IAM image pins, issuer, token lifetimes, users, grants, realm SMTP, WordPress settings and the public gateway remain outside this operation. Public `/admin` and master-realm paths must continue to return404. The companion retains its existing loopback-only publication, unchanged canonical TLS identity and separate Compose project. No realm is created and no public master administration is enabled.

Renewal is an explicit new operation: use a new owned output directory, reselect and revalidate the manager's current exact pair, regenerate the separate companion package with those new file paths, and recreate only that companion after review. Do not overwrite a mounted key in place or restart/reconfigure the existing manager or IAM. Retire old owned material only after the replacement's protected acceptance and rollback window. This adapter does not install a renewal timer.

## Local evidence

```text
python3 -m unittest discover -s infra/private-iam -p 'test_*.py'
```

`test_materialize_certificate.py` generates temporary synthetic EC keys, a CA and real signed leaves through OpenSSL; no private-key fixture is committed. It exercises exact selection and protected files, read-only source preservation, account/unrelated-key filtering, genuine trust/hostname/key/expiry failures, malformed stores, symlink and overwrite refusal, bounded writer retries and ownership-fenced partial cleanup. Tests require available OpenSSL and never substitute a skipped cryptographic result. These tests qualify local implementation only; independent review and actual protected host/browser acceptance are separate gates.

The manager unit and independent adversarial tests add wrong-container/process/cgroup/mount, unsafe ancestry, source race and unchanged-byte replacement checks. The required `private-iam-console` CI job also runs `infra/scripts/private-iam-manager-source-live-smoke.py` against actual Docker, proc descriptors, generated EC certificates and owned synthetic stores. Its isolated covering-mount adversary alone receives `SYS_ADMIN` inside its own private, networkless namespace with synthetic read-only binds; the production reader receives no new capabilities or mounts. Categorical reports are uploaded separately, and a failed assertion or incomplete owned cleanup fails the job. No staging manager or certificate is used by these fixtures.
