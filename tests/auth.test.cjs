const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function setup(overrides={}, hash='') {
 const nodes=new Map(); let callback;
 const element=id=>{if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',hidden:false,disabled:false,classList:{toggle(){}},addEventListener(){}});return nodes.get(id)};
 const auth={getSession:async()=>({data:{session:null}}),onAuthStateChange(fn){callback=fn},...overrides};
 const client={auth,from(){return {select(){return {eq(){return {maybeSingle:async()=>({data:null}),then(resolve){resolve({data:[]})}}}}}}}};
 const c=vm.createContext({window:{location:{origin:'https://jo3lnta.github.io',pathname:'/pulse-app/',hash},supabase:{createClient:()=>client}},document:{getElementById:element,querySelector:()=>element('shell'),querySelectorAll:()=>[]},URLSearchParams,setTimeout,console,localStorage:{getItem:()=> 'es',setItem(){},removeItem(){}},$:element,entries:[],activateAccountData(){},render(){},clearHealthSecret(){},accountStoreKey:id=>id,toast(){},syncHealthEntries:async()=>{},pulseDateLocale:()=> 'es-ES',crypto:require('node:crypto').webcrypto});
 vm.runInContext(fs.readFileSync('auth-errors.js','utf8'),c);
 const app=fs.readFileSync('app.js','utf8');vm.runInContext(app.slice(app.indexOf('// PULSE account and private cloud sync.')),c);
 return {c,nodes,element,auth,callback:()=>callback};
}
test('mail quota errors explain provider problem without showing raw errors',()=>{
 const {c}=setup();assert.match(vm.runInContext('pulseAuthError({code:"over_email_send_rate_limit"})',c),/proveedor de correo/);
 assert.match(vm.runInContext('pulseAuthError({code:"invalid_credentials"})',c),/Correo o contraseña/);
 assert.match(vm.runInContext('pulseAuthError({code:"email_not_confirmed"})',c),/Confirma/);
});
test('only one login request can be in flight',async()=>{
 let resolve,calls=0;
 const {c,element}=setup({signInWithPassword(){calls++;return new Promise(r=>resolve=r)}});
 element('loginEmail').value='member@example.invalid';element('loginPassword').value='test';
 const first=vm.runInContext('handleLogin({preventDefault(){}})',c);
 await vm.runInContext('handleLogin({preventDefault(){}})',c);
 assert.equal(calls,1);resolve({error:{code:'invalid_credentials'}});await first;
 assert.equal(element('loginSubmit').disabled,false);
 assert.match(element('loginMessage').textContent,/Correo o contraseña/);
});
test('a role lookup failure does not prevent opening the signed-in account',async()=>{
 const {c,element}=setup();await new Promise(r=>setImmediate(r));
 vm.runInContext('loadCurrentRole = async () => { throw Error("offline"); }',c);
 await vm.runInContext('finishSignIn({id:"member"})',c);
 assert.equal(element('loginScreen').hidden,true);assert.equal(element('shell').hidden,false);
});
test('password recovery survives the SDK consuming the URL hash',async()=>{
 const {c,element}=setup({},'#access_token=opaque&type=recovery');
 c.window.location.hash='';await new Promise(r=>setImmediate(r));
 assert.equal(element('resetPasswordForm').hidden,false);
 assert.equal(element('shell').hidden,true);
});
