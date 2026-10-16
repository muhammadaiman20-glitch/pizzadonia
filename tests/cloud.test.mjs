import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { build } from 'esbuild'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'

const settings = {
  shopName: 'Test Pizzadonia', open: true,
  shop: { lat: 5.3, lng: 103.1, label: 'Test kitchen' },
  delivery: { baseFee: 3, baseKm: 3, perKm: 1, maxKm: 15, freeAbove: 0 },
  adminPin: '876543', adminEmails: ['owner@example.com'], googleClientId: '123-test.apps.googleusercontent.com',
  staff: { kitchenPin: '123456', riderPin: '654321' },
  payment: { cod: true, transfer: true, bankName: 'Test bank', accountName: 'Test', accountNumber: '123456' },
  telegram: { enabled: false }, aiChat: { baseUrl: '', apiKey: '', model: '' },
}
const session = crypto.randomBytes(24).toString('hex')
const importKey = crypto.randomBytes(32).toString('hex')
const encode = (path, value) => ({ path, data: Buffer.from(JSON.stringify(value)).toString('base64') })
const png = Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,...new Array(700000).fill(1)])
const orderBody = { items: [{ id: 'daging', qty: 1 }], customer: { name: 'Test Buyer', phone: '0123456789' }, location: { lat: 5.3, lng: 103.1, address: 'Test address 123' }, paymentMethod: 'cod' }

await test('Cloudflare persistence and complete business flows', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'pizzadonia-test-'))
  const outfile = path.join(dir,'worker.mjs')
  await build({ entryPoints: ['cloudflare/backend.js'], outfile, bundle: true, format: 'esm', platform: 'node', external: ['cloudflare:workers'], logLevel: 'silent' })
  const options = { modules: true, modulesRoot: dir, scriptPath: outfile, compatibilityDate: '2026-10-16', compatibilityFlags: ['nodejs_compat'],
    durableObjects: { SHOP: { className: 'PizzadoniaShop', useSQLite: true } }, durableObjectsPersist: path.join(dir,'storage'),
    bindings: { IMPORT_KEY: importKey, SITE_ORIGIN: 'https://pizzadonia.pages.dev' },
    // Outbound routing is deterministic and offline in this suite.
    outboundService: () => Response.json({ code: 'Ok', routes: [{ distance: 1000 }] }),
  }
  let mf = new Miniflare({ ...convertV4MiniflareOptions(options), resourcePersistencePath: path.join(dir,'storage') })
  const call = async (url, { method = 'GET', body, owner = false, headers = {} } = {}) => {
    const r = await mf.dispatchFetch('https://pizzadonia.pages.dev'+url, { method,
      headers: { 'CF-Connecting-IP': '198.51.100.10', ...(owner ? { 'x-admin-session': session } : {}), ...(body && !Buffer.isBuffer(body) ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: body ? Buffer.isBuffer(body) ? body : JSON.stringify(body) : undefined,
    })
    return { status: r.status, data: r.headers.get('content-type')?.includes('application/json') ? await r.json() : Buffer.from(await r.arrayBuffer()) }
  }
  try {
    assert.equal((await call('/api/health')).status,503)
    assert.equal((await call('/_migration/import', { method:'POST', body:{files:[]} })).status,404)
    const snapshot = [encode('settings.json',settings), encode('admin-sessions.json',{[session]:{email:'owner@example.com',exp:Date.now()+86400000}})]
    let r = await call('/_migration/import', {method:'POST',body:{files:snapshot,finalize:true},headers:{'x-import-key':importKey}})
    assert.equal(r.status,200,JSON.stringify(r.data))
    assert.equal((await call('/_migration/import',{method:'POST',body:{files:[]},headers:{'x-import-key':importKey}})).status,409)
    assert.equal((await call('/api/health')).data.pcRequired,false)
    assert.equal((await call('/api/shop')).data.cloudHosted,true)
    assert.equal((await call('/api/admin/orders')).status,401)
    assert.equal((await call('/api/admin/orders',{headers:{'x-admin-pin':settings.adminPin,'Tailscale-User-Login':'owner'}})).status,401)
    assert.equal((await call('/api/admin/orders',{owner:true})).status,200)
    assert.equal((await call('/api/orders',{method:'POST',body:orderBody,headers:{origin:'https://evil.example'}})).status,403)
    assert.equal((await call('/api/orders',{method:'POST',body:{...orderBody,items:[]}})).status,400)
    r=await call('/api/account/register',{method:'POST',body:{name:'Test Buyer',phone:'0123456789',pin:'112233'}})
    assert.equal(r.status,200,JSON.stringify(r.data)); const customerToken=r.data.token
    assert.equal((await call('/api/account/login',{method:'POST',body:{phone:'0123456789',pin:'112233'}})).status,200)
    r=await call('/api/orders',{method:'POST',body:orderBody,headers:{authorization:'Bearer '+customerToken}})
    assert.equal(r.status,200,JSON.stringify(r.data));const order=r.data
    assert.equal((await call(`/api/orders/${order.id}?t=wrong`)).status,404)
    assert.equal((await call(`/api/orders/${order.id}?t=${order.token}`)).data.total,19)
    assert.equal((await call('/api/account',{headers:{authorization:'Bearer '+customerToken}})).data.orders.length,1)
    r=await call(`/api/orders/${order.id}/receipt?t=${order.token}`,{method:'POST',body:png,headers:{'Content-Type':'image/png'}})
    assert.equal(r.status,200,JSON.stringify(r.data))
    const orders=(await call('/api/admin/orders',{owner:true})).data.orders
    const receipt=orders[0].payment.receipts[0].file
    const upload=await call('/api/admin/receipts/'+receipt,{owner:true})
    assert.equal(upload.status,200); assert.deepEqual(upload.data,png)
    assert.equal((await call('/api/admin/receipts/'+receipt)).status,401)
    assert.equal((await call('/api/admin/payment-qr',{method:'POST',owner:true,body:png})).status,428)
    r=await call('/api/admin/payment-qr',{method:'POST',owner:true,body:png,headers:{'x-admin-txpin':settings.adminPin}})
    assert.equal(r.status,200,JSON.stringify(r.data))
    assert.deepEqual((await call('/api/payment-qr')).data,png)
    r=await call('/api/staff/kitchen',{headers:{'x-staff-pin':'123456'}}); assert.equal(r.status,200)
    r=await call('/api/support/start',{method:'POST',body:{name:'Test Buyer'}}); assert.equal(r.status,200)
    const chat=r.data
    r=await call(`/api/support/${chat.id}/message?t=${chat.token}`,{method:'POST',body:{text:'Menu dan harga'}})
    assert.equal(r.status,200);assert.ok(r.data.messages.at(-1).text.includes('Daging'))
    assert.equal((await call('/api/admin/ledger',{owner:true})).status,200)
    assert.equal((await call('/api/admin/cloud-backup',{owner:true})).data.version,1)
    assert.equal((await call('/api/admin/cloud-backup')).status,401)
    await t.test('customer wallets are preserved and concurrent spends cannot overdraw',async()=>{
      const auth={authorization:'Bearer '+customerToken}
      r=await call('/api/wallet/activate',{method:'POST',body:{name:'Test Buyer',bankName:'Maybank',accountNumber:'12345678'},headers:auth})
      assert.equal(r.status,200,JSON.stringify(r.data))
      r=await call('/api/admin/wallets/c%3A60123456789/status',{method:'POST',owner:true,body:{action:'approve'}})
      assert.equal(r.status,200,JSON.stringify(r.data))
      r=await call('/api/admin/wallets/c%3A60123456789/credit',{method:'POST',owner:true,body:{amount:25,note:'Test credit'},headers:{'x-admin-txpin':settings.adminPin}})
      assert.equal(r.status,200,JSON.stringify(r.data))
      const results=await Promise.all([1,2].map(()=>call('/api/orders',{method:'POST',body:{...orderBody,paymentMethod:'wallet',txPin:'112233'},headers:auth})))
      assert.deepEqual(results.map(v=>v.status).sort(),[200,400],JSON.stringify(results))
      const wallet=await call('/api/wallet',{headers:auth});assert.equal(wallet.data.wallet.balance,6)
    })
    await mf.dispose(); mf=new Miniflare({ ...convertV4MiniflareOptions(options), resourcePersistencePath: path.join(dir,'storage') })
    assert.equal((await call(`/api/orders/${order.id}?t=${order.token}`)).status,200)
    assert.deepEqual((await call('/api/payment-qr')).data,png)
    assert.equal((await call('/api/account',{headers:{authorization:'Bearer '+customerToken}})).status,200)
    await t.test('rate limits survive object and worker restart',async()=>{
      for(let i=0;i<10;i++) await call('/api/account/login',{method:'POST',body:{phone:'0123456789',pin:'999999'}})
      await mf.dispose();mf=new Miniflare({ ...convertV4MiniflareOptions(options), resourcePersistencePath: path.join(dir,'storage') })
      assert.equal((await call('/api/account/login',{method:'POST',body:{phone:'0123456789',pin:'112233'}})).status,429)
    })
  } finally { await mf.dispose();await rm(dir,{recursive:true,force:true}) }
})
