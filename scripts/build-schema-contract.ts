import nextEnv from '@next/env';nextEnv.loadEnvConfig(process.cwd());
import postgres from 'postgres';
import{randomUUID}from'node:crypto';
import{execFileSync}from'node:child_process';
import{readFile,readdir,writeFile}from'node:fs/promises';
import{isolatedDemoEnabled}from'../lib/demo-environment';
import{collectSchema,digest,type SchemaContracts,type SchemaObjects}from'../lib/schema-doctor';
if(!isolatedDemoEnabled())throw Error('Schema contracts can only be generated in the isolated local fixture.');
const owner=postgres(process.env.DATABASE_URL!,{max:1}),name='pa_contract_'+randomUUID().replaceAll('-','').slice(0,12);let sql:ReturnType<typeof postgres>|undefined;
try{
 await owner.unsafe(`create database ${name}`);
 const schemas=execFileSync('docker',['exec','packapprove-db-1','pg_dump','-U','postgres','-d','postgres','--schema-only','--schema=auth','--schema=storage','--schema=extensions'],{maxBuffer:16*1024*1024});
 execFileSync('docker',['exec','-i','packapprove-db-1','psql','-U','postgres','-d',name,'-v','ON_ERROR_STOP=1'],{input:schemas,stdio:['pipe','pipe','pipe'],maxBuffer:16*1024*1024});
 const url=new URL(process.env.DATABASE_URL!);url.pathname='/'+name;sql=postgres(url.href,{max:1});
 const bundle:SchemaContracts={version:1,migrations:[]};let prior:SchemaObjects={};
 for(const file of(await readdir('supabase/migrations')).filter(f=>/^\d+_.*\.sql$/.test(f)).sort()){
  const source=await readFile('supabase/migrations/'+file,'utf8');
  const actual=await sql.begin(async tx=>{await tx.unsafe(source);await tx`set local search_path=pg_catalog`;return collectSchema(tx)});
  const put=Object.fromEntries(Object.entries(actual).filter(([key,value])=>JSON.stringify(prior[key])!==JSON.stringify(value))),remove=Object.keys(prior).filter(k=>!(k in actual));
  bundle.migrations.push({name:file,sha256:digest(source),put,remove});prior=actual;
 }
 await writeFile('supabase/schema-contracts.json',JSON.stringify(bundle,null,2)+'\n');console.log(JSON.stringify({contracts:bundle.migrations.length,objects:Object.keys(prior).length,scratchOnly:true}));
}finally{await sql?.end();await owner.unsafe(`drop database if exists ${name}`);await owner.end()}
