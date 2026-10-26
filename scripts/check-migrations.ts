import nextEnv from '@next/env';nextEnv.loadEnvConfig(process.cwd());
import postgres from 'postgres';
import {execFileSync}from'node:child_process';
import {readFile}from'node:fs/promises';
import {randomUUID,randomBytes}from'node:crypto';
import assert from 'node:assert/strict';
import {isolatedDemoEnabled}from'../lib/demo-environment';
import {loadMigrationContracts,applyMigrations,migrationDiagnosis}from'../lib/migrations';
import {runtimeDiagnosis}from'../lib/schema-doctor';
if(!isolatedDemoEnabled())throw Error('Scratch migration tests require the separate local fixture.');
const owner=postgres(process.env.DATABASE_URL!,{max:1}),bundle=await loadMigrationContracts(),checks:string[]=[];
const platform=execFileSync('docker',['exec','packapprove-db-1','pg_dump','-U','postgres','-d','postgres','--schema-only','--schema=auth','--schema=storage','--schema=extensions'],{maxBuffer:16*1024*1024});
async function scratch(test:(sql:postgres.Sql,url:URL)=>Promise<void>){
 const name='pa_schema_test_'+randomUUID().replaceAll('-','').slice(0,12);await owner.unsafe(`create database ${name}`);let sql:postgres.Sql|undefined;
 try{execFileSync('docker',['exec','-i','packapprove-db-1','psql','-U','postgres','-d',name,'-v','ON_ERROR_STOP=1'],{input:platform,stdio:['pipe','pipe','pipe'],maxBuffer:16*1024*1024});const url=new URL(process.env.DATABASE_URL!);url.pathname='/'+name;sql=postgres(url.href,{max:1});await test(sql,url);}
 finally{await sql?.end();await owner.unsafe(`drop database ${name}`)}
}
const diagnose=(sql:postgres.Sql)=>sql.begin(async tx=>{await tx`set transaction read only`;await tx`set local search_path=pg_catalog`;return migrationDiagnosis(tx,bundle)});
try{
 await scratch(async(sql,url)=>{
  const result=await applyMigrations(sql,bundle);assert.equal(result.applied.length,4);assert.equal((await diagnose(sql)).prefix,4);checks.push('clean install, all contracts/RLS/ACL/functions');
  const role='pa_schema_runtime_'+randomBytes(6).toString('hex'),password=randomBytes(24).toString('hex');await owner.unsafe(`create role ${role} login noinherit password '${password}'`);
  try{await owner.unsafe(`grant packapprove_app to ${role}`);const runtimeUrl=new URL(url);runtimeUrl.username=role;runtimeUrl.password=password;const runtime=postgres(runtimeUrl.href,{max:1});try{assert.equal((await runtimeDiagnosis(runtime)).safe,true);await assert.rejects(()=>runtime`select * from public.invitations limit 1`,{code:'42501'});checks.push('restricted runtime: no owner/BYPASSRLS/direct invitations');}finally{await runtime.end()}}finally{await owner.unsafe(`drop role ${role}`)}
 });
 await scratch(async sql=>{
  // Reproduce an older installation made through SQL Editor, with no journal.
  for(const step of bundle.migrations.slice(0,2))await sql.unsafe(await readFile('supabase/migrations/'+step.name,'utf8'));
  const org=randomUUID(),project=randomUUID(),artwork=randomUUID(),user=randomUUID(),version=randomUUID(),file=randomUUID();
  await sql`insert into auth.users(id,email) values(${user},'migration-fixture@packapprove.local')`;
  await sql`insert into profiles(id,full_name,role) values(${user},'Migration fixture','designer')`;
  await sql`insert into organizations(id,name,kind) values(${org},'SCRATCH retained client','client')`;
  await sql`insert into projects(id,organization_id,name,deadline) values(${project},${org},'Retained project','2027-01-01')`;
  await sql`insert into artworks(id,project_id,name,deadline) values(${artwork},${project},'Retained artwork','2027-01-01')`;
  await sql`insert into artwork_versions(id,artwork_id,number,author_id,changes) values(${version},${artwork},1,${user},'Retained V1')`;
  await sql`insert into version_files(id,version_id,kind,storage_path,filename,mime_type,size,sha256) values(${file},${version},'preview',${'scratch/'+file},'retained.png','image/png',1,${'a'.repeat(64)})`;
  await assert.rejects(()=>applyMigrations(sql,bundle),/журнала/);
  const result=await applyMigrations(sql,bundle,{repairRegistry:true});assert.equal(result.registryRecovered.length,2);assert.equal(result.applied.length,2);
  assert.equal((await sql`select sha256 from version_files where id=${file}`)[0].sha256,'a'.repeat(64));assert.equal((await sql`select changes from artwork_versions where id=${version}`)[0].changes,'Retained V1');assert.equal((await sql`select packaging_type from artworks where id=${artwork}`)[0].packaging_type,'Коробка');assert.equal((await diagnose(sql)).prefix,4);checks.push('verified journal recovery and upgrade retain project/version/hash');
  await sql.unsafe(`create or replace function public.actor_id() returns uuid language sql stable as $$ select null::uuid $$`);
  const drift=await diagnose(sql);assert.equal(drift.compatible,false);assert(drift.difference.different.some(k=>k.startsWith('function:actor_id(')));await assert.rejects(()=>applyMigrations(sql,bundle,{repairRegistry:true}),/неоднозначны/);assert.equal((await sql`select count(*)::int as n from version_files where id=${file}`)[0].n,1);checks.push('manual actor_id drift detected and automatic replay refused');
 });
 await scratch(async sql=>{
  await sql.unsafe(`create table public.organizations(id uuid primary key,name text not null,kind text not null)`);await sql`insert into organizations values(${randomUUID()},'Retained partial record','client')`;
  await assert.rejects(()=>applyMigrations(sql,bundle,{repairRegistry:true}),/неоднозначны/);assert.equal((await sql`select to_regclass('public.projects') as p,to_regclass('public.schema_migrations') as journal`)[0].p,null);assert.equal((await sql`select count(*)::int as n from organizations`)[0].n,1);checks.push('partial schema refused without recreating tables or changing records');
 });
 console.log(JSON.stringify({migrations:4,checks,scratchOnly:true,productionUntouched:true},null,2));
}finally{await owner.end()}
