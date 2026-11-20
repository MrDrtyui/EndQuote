import assert from 'node:assert/strict'
import test from 'node:test'
import {loadStore} from '../src/booking/live/store-response.ts'

const closed=()=>Response.json({error:{code:'UNAVAILABLE'}},{status:410})
for(const [label,responses,expected] of [
  ['public storefront',[()=>Response.json({revision:1})],{kind:'ready',data:{revision:1}}],
  ['missing',[()=>Response.json({error:{}},{status:404})],{kind:'missing'}],
  ['signed out',[closed,()=>Response.json({error:{}},{status:401})],{kind:'closed'}],
  ['other owner',[closed,()=>Response.json({error:{}},{status:404})],{kind:'closed'}],
  ['expired',[closed,()=>Response.json({kind:'expired',name:'Тест',trial:true,endedAt:null})],{kind:'expired',name:'Тест',trial:true,endedAt:null}],
  ['unpublished',[closed,()=>Response.json({kind:'unpublished',name:'Тест'})],{kind:'unpublished',name:'Тест'}],
  ['republished during lookup',[closed,()=>Response.json({kind:'open'}),()=>Response.json({revision:2})],{kind:'ready',data:{revision:2}}],
  ['network failure',[()=>{throw new TypeError('offline')}],{kind:'error'}],
  ['server failure',[()=>Response.json({error:{}},{status:503})],{kind:'error'}],
  ['private lookup failure',[closed,()=>new Response('Bad gateway',{status:502})],{kind:'error'}],
]){
  test('storefront view: '+label,async t=>{
    const calls=[]
    t.mock.method(globalThis,'fetch',async url=>{calls.push(url);return responses[calls.length-1]()})
    assert.deepEqual(await loadStore('test',false),expected)
    assert.equal(calls.length,responses.length)
    assert.equal(calls[0],'/api/public/test')
    if(calls.length>1)assert.equal(calls[1],'/api/owner/storefront-status/test')
  })
}
