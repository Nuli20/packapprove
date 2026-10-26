import nextEnv from '@next/env';nextEnv.loadEnvConfig(process.cwd());
import postgres from 'postgres';
import {applyMigrations,loadMigrationContracts,migrationDiagnosis} from '../lib/migrations';
const url=process.env.MIGRATION_DATABASE_URL||process.env.DATABASE_URL;
if(!url)throw Error('Нужно серверное подключение migration owner.');
const target=new URL(url),local=['localhost','127.0.0.1'].includes(target.hostname);
const plan=process.argv.includes('--plan');
if(!plan&&!local&&!process.argv.includes('--allow-remote'))throw Error('Remote migration is not automatic. Review backup, staging and db:doctor first; use explicit --allow-remote only for the reviewed target.');
const sql=postgres(url,{max:1,prepare:false});
try{
 const contracts=await loadMigrationContracts();
 if(plan){const d=await sql.begin(async tx=>{await tx`set transaction read only`;await tx`set local search_path=pg_catalog`;return migrationDiagnosis(tx,contracts)});console.log(JSON.stringify({readOnly:true,...d},null,2));if(!d.compatible)process.exitCode=1;}
 else console.log(JSON.stringify(await applyMigrations(sql,contracts,{repairRegistry:process.argv.includes('--repair-registry')}),null,2));
}catch(e){console.error(e instanceof Error&&!('code'in e)?e.message:'Миграция не выполнена. Проверьте подключение и права migration owner. Секреты не выводятся.');process.exitCode=1}
finally{await sql.end()}
