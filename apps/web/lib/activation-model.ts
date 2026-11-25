import { adminHash, adminUuid } from './admin-model';

export const activationContract = 'accesslobby.activation-jobs.v0.1';
export interface ActivationJob {
  id: string; applicationId: string; applicationName: string; clientId: string; applicationStatus: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed'; attempt: number; maxAttempts: number;
  configurationHash: string; reviewReference: string; requestedBy: string; createdAt: string; updatedAt: string;
  lastError: string | null; retryable: boolean; leaseExpiresAt: string | null;
}
const record = (value: unknown): value is Record<string, unknown> => typeof value==='object' && value!==null && !Array.isArray(value);
const text = (value: unknown, max=120): value is string => typeof value==='string' && value.length>0 && value.length<=max && !/[\x00-\x1f\x7f]/.test(value);
const date = (value: unknown): value is string => typeof value==='string' && value.length<=40 && Number.isFinite(Date.parse(value));
function job(value: unknown): ActivationJob | null {
  if(!record(value) || !adminUuid(value.id) || !adminUuid(value.applicationId) || !adminUuid(value.requestedBy) ||
    !text(value.applicationName) || !text(value.clientId,80) || !['requested','cancelled','active','suspended'].includes(String(value.applicationStatus)) ||
    !['queued','running','succeeded','failed'].includes(String(value.status)) || !Number.isSafeInteger(value.attempt) || Number(value.attempt)<0 ||
    !Number.isSafeInteger(value.maxAttempts) || Number(value.maxAttempts)<1 || Number(value.maxAttempts)>5 || Number(value.attempt)>Number(value.maxAttempts) ||
    !adminHash(value.configurationHash) || !text(value.reviewReference) || !date(value.createdAt) || !date(value.updatedAt) ||
    typeof value.retryable!=='boolean' || !(value.leaseExpiresAt===null || date(value.leaseExpiresAt)) ||
    !(value.lastError===null || (typeof value.lastError==='string' && /^activation_[a-z_]+$/.test(value.lastError)))) return null;
  return {id:value.id,applicationId:value.applicationId,applicationName:value.applicationName,clientId:value.clientId,
    applicationStatus:String(value.applicationStatus),status:value.status as ActivationJob['status'],attempt:Number(value.attempt),maxAttempts:Number(value.maxAttempts),
    configurationHash:value.configurationHash,reviewReference:value.reviewReference,requestedBy:value.requestedBy,createdAt:value.createdAt,
    updatedAt:value.updatedAt,lastError:value.lastError,retryable:value.retryable,leaseExpiresAt:value.leaseExpiresAt};
}
export function parseActivationJob(value: unknown): ActivationJob | null {
  return record(value) && value.contract===activationContract ? job(value.job) : null;
}
export function parseActivationJobs(value: unknown): {jobs:ActivationJob[];nextCursor:string|null}|null {
  if(!record(value) || value.contract!==activationContract || !Array.isArray(value.jobs) || value.jobs.length>25 ||
    !(value.nextCursor===null || adminUuid(value.nextCursor))) return null;
  const jobs=[];for(const row of value.jobs){const parsed=job(row);if(!parsed)return null;jobs.push(parsed);}
  return {jobs,nextCursor:value.nextCursor};
}
export const activationStatus = (status: ActivationJob['status']) => ({queued:'Queued',running:'Running',succeeded:'Succeeded',failed:'Failed'})[status];
export const activationErrors: Record<string,string> = {
  activation_review_required:'A current independent approval is required. Renew domain proof and review before requesting activation.',
  activation_authority_changed:'The requester or reviewer authority changed. A fresh authorized request and, where needed, review are required.',
  activation_requester_unavailable:'The original activation requester no longer has current authority.',
  activation_configuration_changed:'The application changed. Review the current configuration and request a new activation.',
  activation_application_unavailable:'The application is not eligible for this activation request.',
  activation_dns_unavailable:'Current domain proof could not be confirmed. Correct or restore proof before retrying.',
  activation_iam_configuration_mismatch:'The existing authentication client differs from the reviewed configuration. A private operator must investigate.',
  activation_private_service_unavailable:'The private activation service could not complete the check. A permitted retry is available within the attempt limit.',
  activation_credential_unavailable:'The private worker has no usable scoped credential. Configure the protected runner before retrying.',
  activation_lease_lost:'This worker lost its claim. Inspect the current job before another attempt.',
  activation_attempts_exhausted:'The attempt limit was reached. A private operator must investigate before further work.',
  activation_attempt_changed:'The job changed while this page was open. Refresh its current status.',
  activation_retry_unavailable:'This job cannot be retried in its current state.',
};
export const activationNotices: Record<string,string> = {
  queued:'Private activation queued. The application stays inactive until the protected worker completes its checks.',
  retried:'Activation queued for another private check. Its current status is shown below.',
  existing:'An activation job already exists. Its current status is shown below; this request did not schedule another attempt.',
  unavailable:'The result could not be confirmed. Inspect the current job before repeating the request.',
  ...activationErrors,
};
