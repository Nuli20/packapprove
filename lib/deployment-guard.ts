import {AppError} from './security';
/** Branch deploys must never inherit a usable production backend accidentally. */
export function assertDeploymentBackend(env:Readonly<Record<string,string|undefined>>=process.env){
 if(env.VERCEL_ENV!=='preview')return;
 const ref=env.PACKAPPROVE_PREVIEW_PROJECT_REF;
 let allowed=false;
 try{
  const supa=new URL(env.SUPABASE_URL||''),db=new URL(env.DATABASE_URL||'');
  allowed=!!ref&&/^[a-z0-9]{20}$/.test(ref)&&supa.protocol==='https:'&&supa.hostname===ref+'.supabase.co'&&['postgres:','postgresql:'].includes(db.protocol)&&
   (db.hostname===`db.${ref}.supabase.co`||(db.hostname.endsWith('.pooler.supabase.com')&&decodeURIComponent(db.username)==='postgres.'+ref));
 }catch{}
 if(!allowed)throw new AppError(503,'Тестовое подключение ещё не подготовлено. Доступна публичная 3D-демонстрация /can-lab.');
}
