# Round-four staging — forwarded operator observations, 28 November 2026

**Provenance: OWNER-FORWARDED OPERATOR OBSERVATION.** No new operator evidence commit or exact observation timestamp was supplied. The integrator has recorded the forwarded report without repeating host, browser, restore or application tests. The [structured report](operator-report.json) and [release record](../../releases/operator-round4-staging-2026-11-28.json) preserve this distinction. Existing source/CI/publication evidence remains separate.

## Reported rollout

| Item | Forwarded observation |
|---|---|
| Application source | `8f63578deb485a9457522f2b8ff0d4b89bb2c588` |
| API image digest | `sha256:0b9f19a0dfe2698308f21b80f2414a64aca30a1e65cf9af6f4512091dd556ada` |
| Web image digest | `sha256:f6d9fce02f4d21a5dfd7528fefe8d4211c829b0870c95e005aa8dc1ffe0db7fb` |
| Runtime | Selected API/web pins running; live and ready responses report the selected source |
| Schema | Prefixes `001–006` and `009–017` present; reserved `007/008` absent |
| Anonymous admin | `401` |
| PWA | New build's worker activated |
| Preserved infrastructure | IAM container `d9186d9d2352` and gateway `1cf176cf3f61` unchanged |

The release record now marks host pull/readback complete and the selected release promoted **on the strength of this operator report**. It does not convert the five feature gates into staging acceptance. No new image, host or browser action was performed by this integrator.

## Reported recovery rehearsal

Fresh backups remain on the protected host. Private backup paths and backup contents are excluded from this record.

| Database | Bytes | Reported SHA-256 |
|---|---:|---|
| Identity | 72,795 | `207250758328e7885ef8415fa7f3defbde6ec7c9a109bad26f5b76ae3605e2a6` |
| IAM | 266,355 | `8199adbfa74595895625f2fdcc6a193474693128c84ba28ebb6a8fd5cf0992ca` |

The operator reports restoration into isolated PostgreSQL **17.11**, matching the pre-migration inventories, followed by removal of the isolated instance. No live database was overwritten. The forwarded report did not separately supply the compared inventory counts; this record does not substitute older counts. The integrator did not recompute private-file hashes or repeat the restore. Complete recovery and scheduled-backup acceptance retain their other gates.

## Inactive application request

The reported request → edit → cancel → resubmit path used client `al-qual-consumer`, with references `QUAL-EDIT-20261128`, `QUAL-CANCEL-20261128` and `QUAL-RESUBMIT-20261128`. Its final name is **Qualification consumer revised**, its status is **requested**, and its callback is `https://al-qual-consumer.realjanelove.com/callback`.

This records only the reported happy-path observations. Stale-page and foreign-owner negative cases were not reported. Domain verification, independent review, private-worker activation and actual consumer qualification remain unperformed. The existing five active applications are preserved; the requested fixture is separate. No new total application count was reported.

## DNS and consumer continuation

Manual publication remains pending confirmation. The public ownership challenge is:

| Type | Name | Value / requested setting |
|---|---|---|
| TXT | `_accesslobby-verify.al-qual-consumer.realjanelove.com` | `accesslobby-verify=5j9xrJjc2xV_FzY6lmXejLW74DRXo2Zv-UkFRisdlnE` |
| A | `al-qual-consumer.realjanelove.com` | Desired address `49.12.212.170`, **DNS only** |

`Auto` is the requested provider-default TTL selection, not an AccessLobby rule. The owner reported the consumer host record missing before manual action. Neither record was published by the root browser, which was signed out. Independent DNS requests failed with `ECONNREFUSED`; that is not an NXDOMAIN answer and does not establish whether either record currently exists. Publication and readback remain unconfirmed pending new information.

Selected consumer digest `sha256:940e5ad361da2542e8122e33b13249e5f59a5e2832fe6e9b031498b26bd655f0` was **not deployed**. The existing consumer remains unchanged.

## Ordinary status fixture

Fixture account `al-fixture-status-20261128` completed a genuine Authorization Code with PKCE sign-in. Reported active people increased **14 → 15**. The fixture's person identifier remains private. The browser was subsequently signed out; the status mutation was **NOT RUN**. This does not establish suspension, resumption or old-bearer denial acceptance.

## Private Keycloak route

Source validation refused a root-owned `0600` source file because an ancestor directory was world writable: `protected_directory_required`. File mode alone did not establish a protected path. The source was left unchanged. The source and unsafe directory paths are omitted.

Only that source-validation refusal is recorded. Certificate materialization, private proxy access and master-administrator login are all **NOT RUN**. No private route or master login is claimed from this preflight result.

## Remaining acceptance

| New feature | Actual staging qualification |
|---|---|
| Own recorded app sessions | NOT RUN |
| Personal session-ending history | NOT RUN |
| Safe admitted app launcher | NOT RUN |
| Owner entry-grant expiry and directory | NOT RUN |
| Filtered operator history and CSV | NOT RUN |

All three owner grants, 300-second token lifetime, SMTP port 587/authentication/STARTTLS, IAM/gateway containers and WordPress estate are reported unchanged. No owner UUID, credential, token, cookie, delivered link or private backup/certificate path appears in the evidence.

The rollback remains the qualified `713140ad` API/web pair. Preserve additive tables and history; no new-schema application rollback rehearsal was reported. **Staging feature qualification and production qualification remain false.** Issues **59, 72, 74, 76 and 85** stay open for their remaining gates. Continue the [controlled round-four procedure](../../runbooks/operator-round-4.md) without repeating accepted rollout or earlier qualification merely to fill an unrelated gate.
