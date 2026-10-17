import { test } from 'node:test'
import assert from 'node:assert/strict'
import { autoRefresh } from '../src/sync.js'
function setup() {
  const window = new EventTarget(), document = new EventTarget(), navigator = { onLine: true }
  document.visibilityState = 'visible'
  let counter = 0
  const pending = new Map()
  const timers = { setTimeout(fn) { pending.set(++counter,fn); return counter }, clearTimeout(id) { pending.delete(id) } }
  return { window, document, navigator, timers, pending, async settle() { await new Promise(resolve => setImmediate(resolve)) }, tick() { const [id,fn] = pending.entries().next().value; pending.delete(id); fn() } }
}
test('another device’s changed data is picked up by the next poll; focus and reconnect refresh immediately',async()=>{
  const env=setup();let remote={price:18},local,calls=0
  const stop=autoRefresh(async()=>{calls++;local={...remote}},5000,env)
  await env.settle();assert.equal(local.price,18)
  remote={price:22};env.tick();await env.settle();assert.equal(local.price,22)
  env.document.visibilityState='hidden';env.document.dispatchEvent(new Event('visibilitychange'));assert.equal(env.pending.size,0)
  remote={price:27};env.document.visibilityState='visible';env.document.dispatchEvent(new Event('visibilitychange'));await env.settle();assert.equal(local.price,27)
  env.navigator.onLine=false;env.window.dispatchEvent(new Event('offline'));assert.equal(env.pending.size,0)
  env.navigator.onLine=true;env.window.dispatchEvent(new Event('online'));await env.settle();assert.equal(calls,4)
  env.window.dispatchEvent(new Event('pz:data-changed'));await env.settle();assert.equal(calls,5)
  stop();assert.equal(env.pending.size,0)
  env.window.dispatchEvent(new Event('focus'));await env.settle();assert.equal(calls,5)
})
test('slow requests never overlap and a change during a request triggers a follow-up refresh',async()=>{
 const env=setup();let calls=0,finish
 const stop=autoRefresh(()=>{calls++;return new Promise(resolve=>finish=resolve)},5000,env)
 env.window.dispatchEvent(new Event('focus'));env.window.dispatchEvent(new Event('online'))
 assert.equal(calls,1);finish();await env.settle();assert.equal(calls,2)
 stop();finish();await env.settle();assert.equal(env.pending.size,0)
})
test('a failed refresh retries later without an unhandled rejection',async()=>{
 const env=setup();let calls=0
 const stop=autoRefresh(async()=>{calls++;if(calls===1)throw new Error('offline')},5000,env)
 await env.settle();assert.equal(env.pending.size,1);env.tick();await env.settle();assert.equal(calls,2);stop()
})
