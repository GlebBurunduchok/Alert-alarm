import {mkdir,copyFile,writeFile} from 'node:fs/promises';
await mkdir('_site',{recursive:true});
await copyFile('index.html','_site/index.html');
await writeFile('_site/.nojekyll','');
// One public fetch per build; no tokens or private map endpoints.
// On failure deploy the UI without a report, so it never serves a fake all-clear.
try{
 const response=await fetch('https://api.alerts.in.ua/v3/alerts/active.md',{signal:AbortSignal.timeout(15000),headers:{Accept:'text/plain'}});
 if(!response.ok)throw new Error('Report HTTP '+response.status);
 const text=await response.text();
 if(text.length>1000000||!text.startsWith('# SITREP')||!text.includes('## 15. NOTES, DEFINITIONS AND CAVEATS'))throw new Error('Unexpected report format');
 await writeFile('_site/alerts-report.md',text);
 console.log('Public report copied. The client checks its timestamp independently.');
}catch(error){console.warn('Report unavailable: '+error.message+'. Alarms will use scheduled time.');}
