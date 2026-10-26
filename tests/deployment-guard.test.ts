import {it,expect}from'vitest';
import{assertDeploymentBackend}from'../lib/deployment-guard';
const ref='abcdefghijklmnopqrst';
it('preview cannot use inherited production credentials without an explicit matching staging reference',()=>{
 expect(()=>assertDeploymentBackend({VERCEL_ENV:'preview',SUPABASE_URL:`https://${ref}.supabase.co`,DATABASE_URL:`postgresql://postgres:fixture@db.${ref}.supabase.co/postgres`})).toThrow('Тестовое подключение');
 expect(()=>assertDeploymentBackend({VERCEL_ENV:'preview',PACKAPPROVE_PREVIEW_PROJECT_REF:ref,SUPABASE_URL:`https://${ref}.supabase.co`,DATABASE_URL:'postgresql://postgres:fixture@db.other.supabase.co/postgres'})).toThrow();
});
it('a declared separate staging ref must match both Auth/Storage and PostgreSQL',()=>{
 for(const DATABASE_URL of [`postgresql://postgres:fixture@db.${ref}.supabase.co/postgres`,`postgresql://postgres.${ref}:fixture@aws-0-ap-northeast-1.pooler.supabase.com/postgres`])expect(()=>assertDeploymentBackend({VERCEL_ENV:'preview',PACKAPPROVE_PREVIEW_PROJECT_REF:ref,SUPABASE_URL:`https://${ref}.supabase.co`,DATABASE_URL})).not.toThrow();
});
it('existing production and isolated local configuration need no new preview setting',()=>{
 expect(()=>assertDeploymentBackend({VERCEL_ENV:'production'})).not.toThrow();expect(()=>assertDeploymentBackend({})).not.toThrow();
});
