const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
function setup(response) {
  const elements = new Map();
  const writes = [];
  const context = vm.createContext({
    document: {getElementById(id) {if (!elements.has(id)) elements.set(id, {value:'', hidden:true, addEventListener(){}}); return elements.get(id);}, addEventListener(){}},
    setInterval(){}, currentUser:{id:'account-a'}, entries:[{id:'manual'}, {id:'old-health',source:'apple-health'}],
    pulseClient:{from(){return {select(){return {eq:response}}}},rpc:async()=>({data:{connected:true}})},
    localStorage:{setItem(k,v){writes.push([k,JSON.parse(v)])}}, accountStoreKey:id=>id,
    fromCloudRow:row=>row, render(){}, pulseDateLocale:()=> 'en-GB'
  });
  vm.runInContext(fs.readFileSync('health-sync.js','utf8'),context);
  return {context,elements,writes};
}
test('repeated refresh replaces daily Health data and keeps manual records',async()=>{
  let value=100;
  const {context,writes}=setup(async()=>({data:[{id:'health',value:value++}]}));
  await vm.runInContext('syncHealthEntries()',context);
  await vm.runInContext('syncHealthEntries()',context);
  assert.equal(context.entries.length,2);
  assert.equal(context.entries[0].id,'manual');
  assert.equal(context.entries[1].source,'apple-health');
  assert.equal(context.entries[1].value,101);
  assert.equal(writes[1][0],'account-a');
});
test('delayed response from another account cannot write records',async()=>{
  let resolve;
  const {context,writes}=setup(()=>new Promise(r=>resolve=r));
  const result=vm.runInContext('syncHealthEntries()',context);
  context.currentUser={id:'account-b'};
  resolve({data:[{id:'private-a'}]}); await result;
  assert.equal(writes.length,0);
  assert.equal(context.entries[1].id,'old-health');
});
test('server failure preserves local history',async()=>{
  const {context,elements,writes}=setup(async()=>({error:new Error('offline')}));
  await vm.runInContext('syncHealthEntries()',context);
  assert.equal(writes.length,0);
  assert.equal(context.entries.length,2);
  assert.match(elements.get('healthStatus').textContent,/Could not fetch/);
});
test('clear secret removes the token from the page',()=>{
  const {context,elements}=setup(async()=>({data:[]}));
  context.document.getElementById('healthToken').value='private';
  vm.runInContext('clearHealthSecret()',context);
  assert.equal(elements.get('healthToken').value,'');
  assert.equal(elements.get('healthSecret').hidden,true);
});
