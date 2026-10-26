import {readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import type postgres from 'postgres';
import {collectSchema,exactPrefix,expectedSchema,schemaDifference,digest,type CatalogConnection,type SchemaContracts} from './schema-doctor';
export async function loadMigrationContracts(root=process.cwd()){
 const bundle=JSON.parse(await readFile(join(root,'supabase/schema-contracts.json'),'utf8')) as SchemaContracts;
 const files=(await readdir(join(root,'supabase/migrations'))).filter(f=>/^\d+_.*\.sql$/.test(f)).sort();
 if(bundle.version!==1||files.join('|')!==bundle.migrations.map(m=>m.name).join('|'))throw Error('Набор миграций не совпадает с проверенным контрактом. Обновите контракт на изолированной БД.');
 for(const m of bundle.migrations)if(digest(await readFile(join(root,'supabase/migrations',m.name),'utf8'))!==m.sha256)throw Error('Изменён исходный файл миграции: '+m.name);
 return bundle;
}
export async function migrationDiagnosis(tx:CatalogConnection,bundle:SchemaContracts){
 const actual=await collectSchema(tx),prefix=exactPrefix(bundle,actual);
 const [reg]=await tx.unsafe(`select to_regclass('public.schema_migrations') as name`);
 let applied:string[]=[];let registryReadable=true;
 if(reg.name){const [access]=await tx.unsafe(`select has_table_privilege(current_user,'public.schema_migrations','SELECT') as ok`);registryReadable=access.ok;if(access.ok)applied=(await tx.unsafe('select name from public.schema_migrations order by name')).map(r=>r.name);}
 const known=bundle.migrations.map(m=>m.name),unknown=applied.filter(n=>!known.includes(n)),unregistered=prefix===null?[]:known.slice(0,prefix).filter(n=>!applied.includes(n));
 const historyAhead=prefix!==null&&applied.some(n=>known.indexOf(n)>=prefix);
 const difference=prefix===null?schemaDifference(expectedSchema(bundle),actual):{missing:[],different:[],unexpected:[]};
 return {prefix,objects:Object.keys(actual).length,registryExists:!!reg.name,registryReadable,applied,unknown,unregistered,historyAhead,difference,pending:prefix===null?[]:known.slice(prefix),compatible:prefix!==null&&!unknown.length&&!historyAhead};
}
export async function applyMigrations(sql:postgres.Sql,bundle:SchemaContracts,options:{repairRegistry?:boolean;root?:string}={}){
 return sql.begin(async tx=>{
  await tx`select pg_advisory_xact_lock(703251001)`;
  await tx`set local search_path=pg_catalog`;
  const d=await migrationDiagnosis(tx,bundle);
  if(!d.compatible||!d.registryReadable)throw Error('Схема или журнал неоднозначны. Ничего не применено. Выполните db:doctor; требуется review адресного исправления.');
  if(d.unregistered.length&&!options.repairRegistry)throw Error('Схема полностью проверена, но отсутствуют записи журнала. Сначала db:doctor, затем явный db:setup -- --repair-registry после backup.');
  await tx`create table if not exists public.schema_migrations(name text primary key,applied_at timestamptz not null default now())`;
  await tx`alter table public.schema_migrations enable row level security`;
  for(const name of d.unregistered)await tx`insert into public.schema_migrations(name) values(${name})`;
  const applied:string[]=[];
  for(const m of bundle.migrations.slice(d.prefix!)){
   await tx`set local search_path=public,extensions`;
   await tx.unsafe(await readFile(join(options.root||process.cwd(),'supabase/migrations',m.name),'utf8'));
   await tx`set local search_path=pg_catalog`;
   const after=await collectSchema(tx),index=bundle.migrations.findIndex(s=>s.name===m.name)+1,diff=schemaDifference(expectedSchema(bundle,index),after);
   if(diff.missing.length||diff.different.length||diff.unexpected.length)throw Error('Проверка схемы после миграции не прошла; транзакция отменена: '+m.name);
   await tx`insert into public.schema_migrations(name) values(${m.name})`;applied.push(m.name);
  }
  return {applied,registryRecovered:d.unregistered,transactional:true};
 });
}
