'use strict';
// Operator-only bootstrap for an EMPTY test/project database. Never run automatically.
// Supply values through a secret manager or ignored --env-file, not command-line passwords.
const {createClient}=require('@supabase/supabase-js');
const {configuration}=require('./supabase-auth');
const {createStaffAdmin}=require('./supabase-admin');
async function main(){
  if(process.argv[2]!=='--empty-project')throw Error('Explicit --empty-project is required.');
  const config=configuration();
  const input={id:process.env.BOOTSTRAP_LOGIN_ID,name:process.env.BOOTSTRAP_NAME,
    password:process.env.BOOTSTRAP_PASSWORD,role:'sysadmin'};
  delete process.env.BOOTSTRAP_PASSWORD;
  const admin=createClient(config.url,config.secretKey,{auth:{persistSession:false,autoRefreshToken:false}});
  await createStaffAdmin(admin).create(null,input);
  console.log('Initial administrator created. No password or internal address was printed.');
}
if(require.main===module)main().catch(()=>{console.error('Bootstrap failed. Verify empty-project status and server configuration.');process.exitCode=1;});
module.exports={main};
