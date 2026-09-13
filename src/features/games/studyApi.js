import {supabase} from '../../lib/supabaseClient';
export async function studyPost(path,body,signal){
 if(import.meta.env.VITE_GITHUB_PAGES==='true')throw new Error('This activity needs API hosting. Open the full Campfire deployment.');
 const {data,error}=await supabase.auth.getSession();
 if(error||!data.session)throw new Error('Sign in to continue.');
 const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${data.session.access_token}`},body:JSON.stringify(body),signal:signal||AbortSignal.timeout(60000)});
 const result=await response.json();if(!response.ok)throw new Error(result.error||'The request failed.');return result;
}
export async function gameRpc(name,args){const {data,error}=await supabase.rpc(name,args);if(error)throw new Error(error.message);return data;}
