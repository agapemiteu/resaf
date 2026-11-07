import fs from 'node:fs';
const source=process.argv[2];
if(!source||!fs.existsSync(source)){console.error('Newman report is unavailable.');process.exit(1);}
const report=JSON.parse(fs.readFileSync(source,'utf8'));
const summary={collection:report.collection.info.name,checked_at:new Date().toISOString(),commit:process.env.GITHUB_SHA||null,
  requests:report.run.stats.requests,assertions:report.run.stats.assertions,
  checks:report.run.executions.map(execution=>({name:execution.item.name,status:execution.response?.code||null,
    assertions:(execution.assertions||[]).map(a=>({name:a.assertion,passed:!a.error}))})),
  failures:report.run.failures.map(f=>({source:f.source?.name||null,message:f.error?.message||'Check failed'}))};
fs.mkdirSync('artifacts',{recursive:true});
fs.writeFileSync('artifacts/postman-summary.json',JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify({requests:summary.requests.total,assertions:summary.assertions.total,failed:summary.failures.length}));
