import { adminHash, adminUuid, type AdminAccess } from './admin-model';
import { activationNotices, parseActivationJob } from './activation-model';

type Access = {state:'ready';access:AdminAccess}|{state:'signed-out'|'forbidden'|'unavailable'};
type Dependencies={getAccess:()=>Promise<Access>;api:(path:string,init:{method:string;body:object})=>Promise<Response>};
const response=(message:string,status:number)=>new Response(message,{status,headers:{'cache-control':'private, no-store, max-age=0'}});
const redirect=(path:string,origin:string)=>new Response(null,{status:303,headers:{location:new URL(path,origin).href,'cache-control':'private, no-store, max-age=0'}});
async function form(request:Request){
  if(request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase()!=='application/x-www-form-urlencoded' || !request.body)return null;
  const reader=request.body.getReader();let size=0;const chunks:Uint8Array[]=[];
  try{while(true){const next=await reader.read();if(next.done)break;size+=next.value.length;if(size>4096){await reader.cancel();return null;}chunks.push(next.value);}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    return new URLSearchParams(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  }catch{return null;}finally{reader.releaseLock();}
}
export async function handleActivationAction(request:Request,origin:string,dependencies:Dependencies):Promise<Response>{
  if(request.method!=='POST')return response('Method not allowed',405);
  if(request.headers.get('origin')!==origin)return response('Origin rejected',403);
  let access:Access;try{access=await dependencies.getAccess();}catch{return response('Administration unavailable',503);}
  if(access.state==='signed-out')return redirect('/auth/login',origin);
  if(access.state==='forbidden')return response('Operator access required',403);
  if(access.state!=='ready')return response('Administration unavailable',503);
  if(!access.access.capabilities.activateApplications)return response('Application operator access required',403);
  const values=await form(request);if(!values)return response('Invalid activation form',400);
  const intent=values.get('intent');const keys=intent==='queue'?['intent','applicationId','configurationHash','reviewReference']:intent==='retry'?['intent','jobId','expectedAttempt']:[];
  if(!keys.length || keys.some(key=>values.getAll(key).length!==1) || [...values.keys()].some(key=>!keys.includes(key)))return response('Invalid activation form',400);
  let path:string,body:object,back:string;
  if(intent==='queue'){
    const appId=values.get('applicationId'),configurationHash=values.get('configurationHash'),reviewReference=values.get('reviewReference');
    if(!adminUuid(appId) || !adminHash(configurationHash) || !reviewReference || !/^[A-Za-z0-9._:/-]{4,120}$/.test(reviewReference))return response('Invalid activation form',400);
    path=`/v1/admin/applications/${appId}/activation-jobs`;body={configurationHash,reviewReference};back=`/admin/applications/${appId}`;
  }else{
    const id=values.get('jobId'),attempt=values.get('expectedAttempt');
    if(!adminUuid(id) || !attempt || !/^[1-5]$/.test(attempt))return response('Invalid activation form',400);
    path=`/v1/admin/activation-jobs/${id}/retry`;body={expectedAttempt:Number(attempt)};back=`/admin/activations/${id}`;
  }
  let notice='unavailable';
  try{
    const result=await dependencies.api(path,{method:'POST',body});
    if(result.status===401)return redirect('/auth/login',origin);
    if(result.status===403)return response('Application operator access required',403);
    const data=await result.json().catch(()=>null);
    const parsed=result.ok?parseActivationJob(data):null;
    if(parsed && (intent!=='queue' || parsed.applicationId===values.get('applicationId')) && (intent!=='retry' || parsed.id===values.get('jobId'))){
      const notice=parsed.status==='queued'?(intent==='queue'?'queued':'retried'):'existing';
      return redirect(`/admin/activations/${parsed.id}?notice=${notice}`,origin);
    }
    if(!result.ok && data && typeof data.error==='string' && Object.hasOwn(activationNotices,data.error))notice=data.error;
  }catch{/* Uncertain work is never shown as successful. */}
  return redirect(`${back}?notice=${encodeURIComponent(notice)}`,origin);
}
