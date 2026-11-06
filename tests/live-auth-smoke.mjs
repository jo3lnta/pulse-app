// Does not create accounts, send emails or delete any data.
import assert from 'node:assert/strict';
const base='https://sxsrlucazbgigxllxfgc.supabase.co';
const key='sb_publishable_WDTnMx0ugljuRqS4a16bGA_V-Y3c1w4';
const headers={apikey:key,'Content-Type':'application/json'};
const settings=await fetch(base+'/auth/v1/settings',{headers,signal:AbortSignal.timeout(30000)});
assert.equal(settings.status,200,'Auth settings endpoint must be reachable');
const config=await settings.json();
console.log(JSON.stringify({emailEnabled:config.external?.email,signupEnabled:!config.disable_signup,emailConfirmationRequired:!config.mailer_autoconfirm}));
const invalid=await fetch(base+'/auth/v1/token?grant_type=password',{method:'POST',headers,body:JSON.stringify({email:'pulse-smoke-'+crypto.randomUUID()+'@example.invalid',password:crypto.randomUUID()}),signal:AbortSignal.timeout(30000)});
assert.equal(invalid.status,400,'Unknown credentials must not create a session');
const error=await invalid.json();assert.equal(error.code||error.error_code,'invalid_credentials');
const removal=await fetch(base+'/functions/v1/pulse-delete-account',{method:'POST',headers,body:JSON.stringify({confirmation:'DELETE'}),signal:AbortSignal.timeout(30000)});
assert.equal(removal.status,401,'Account removal must reject missing sessions');
const rejected=await removal.json();assert.equal(rejected.error,'Sign in first');
console.log('Live Auth responds correctly; anonymous account removal rejected. No accounts changed.');
