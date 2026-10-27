import nextEnv from '@next/env';nextEnv.loadEnvConfig(process.cwd());
import postgres from 'postgres';
import {loadMigrationContracts,migrationDiagnosis} from '../lib/migrations';
import {runtimeDiagnosis} from '../lib/schema-doctor';
const sql=postgres(process.env.MIGRATION_DATABASE_URL||process.env.DATABASE_URL!,{max:1,prepare:false});
try{
 const bundle=await loadMigrationContracts();
 const result=await sql.begin(async tx=>{await tx`set transaction read only`;await tx`set local search_path=pg_catalog`;await tx`set local statement_timeout='15s'`;const schema=await migrationDiagnosis(tx,bundle),runtime=await runtimeDiagnosis(tx);return {readOnly:true,schema,runtime}});
 console.log(JSON.stringify(result,null,2));
 if(!result.schema.compatible||!result.schema.registryReadable)process.exitCode=1;
 if(process.argv.includes('--runtime')){
  // Check the actual runtime URL, not the separate migration owner connection.
  const runtime=postgres(process.env.DATABASE_URL!,{max:1,prepare:false});
  try{const check=await runtime.begin(async tx=>{await tx`set transaction read only`;return runtimeDiagnosis(tx)});console.log(JSON.stringify({runtimeConnection:check},null,2));if(!check.safe)process.exitCode=2;}finally{await runtime.end()}
 }
}catch(e){console.error(e instanceof Error&&!('code'in e)?e.message:'Диагностика недоступна. Проверьте подключение и права; секреты не выводятся.');process.exitCode=1}
finally{await sql.end()}
