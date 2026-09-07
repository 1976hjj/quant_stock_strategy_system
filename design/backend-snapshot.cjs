const fs=require('node:fs/promises'), path=require('node:path');
async function readSnapshot(){
 const root=await fs.realpath(process.env.QUANT_BACKEND_ROOT||'D:/futures_quant_strategy'),warnings=[],sources=[];
 async function read(relative,optional=false){try{const file=await fs.realpath(path.join(root,relative));if(!file.startsWith(root+path.sep))throw Error('outside source root');const stat=await fs.stat(file);if(stat.size>20*1024*1024)throw Error('file too large');const data=JSON.parse(await fs.readFile(file,'utf8'));sources.push({path:relative,modified_at:stat.mtime.toISOString()});return data}catch(e){if(!optional)throw e;warnings.push(relative+': '+e.message);return null}}
 const latest=await read('reports/factor_explorer/latest.json'),id=latest.report_id?.replace('sha256:','');if(!/^[a-f0-9]{64}$/.test(id))throw Error('invalid report pointer');
 const evidence=await read(`reports/factor_explorer/${id}/evidence-summary.json`);if(evidence.report?.report_id!==latest.report_id||!Array.isArray(evidence.factors))throw Error('inconsistent evidence');
 const warehouse=await read('reports/warehouse_audit.json',true),pipeline=await read('reports/m4_pipeline_current.json',true),releases=[],ingestion=[];
 for(const kind of ['releases','processed_releases'])for(const entry of await fs.readdir(path.join(root,'data/factor_store',kind),{withFileTypes:true}).catch(()=>[])){if(!entry.isDirectory()||!/^[a-f0-9]{64}$/.test(entry.name))continue;const m=await read(`data/factor_store/${kind}/${entry.name}/manifest.json`,true);if(m)releases.push({kind,...m})}
 for(const name of ['tushare_archive','tushare_reference_archive','tushare_corporate_action_archive','tushare_financial_archive','tushare_m2e_archive']){const s=await read(`data/${name}/run_status.json`,true);if(s)ingestion.push({name,...s})}
 return {schema_version:1,source_root:root,read_at:new Date().toISOString(),evidence,warehouse,pipeline,releases,ingestion,sources,warnings};
}
module.exports={readSnapshot};
