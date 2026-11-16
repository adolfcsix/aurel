import fs from 'node:fs';
const isPg=process.env.AUREL_STORAGE==='postgres';
console.log('AUREL diagnostic');
console.log('Node:',process.version,'(recommended >=22)');
console.log('Storage:',isPg?'PostgreSQL':'Local JSON demo');
console.log('Environment file:',fs.existsSync('../.env')?'found':'not found (JSON demo uses defaults)');
console.log('DATABASE_URL:',process.env.DATABASE_URL?'configured':'not configured');
console.log('ADMIN_INITIAL_PASSWORD:',process.env.ADMIN_INITIAL_PASSWORD?'configured':'not configured');
if(isPg){if(!process.env.DATABASE_URL){console.error('PostgreSQL mode requires DATABASE_URL');process.exitCode=1}
 else{try{const {Client}=await import('pg');const c=new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:3000});await c.connect();const r=await c.query("SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('projects','units','leases','payment_schedules','payments','reminder_contacts','deposit_settlements','reminder_notifications','payment_attachments')");console.log('Core SQL tables:',r.rows[0].count,'/ 9');if(r.rows[0].count<9)process.exitCode=1;await c.end()}catch(e){console.error('PostgreSQL check failed:',e.code||e.message);process.exitCode=1}}}
else console.log('JSON demo: no PostgreSQL required');
