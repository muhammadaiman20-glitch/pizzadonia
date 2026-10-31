import test from 'node:test'
import assert from 'node:assert/strict'
import { createUpdater, updatePlan } from '../src/appUpdater.js'

const v = (versionCode, versionName) => ({ versionCode, versionName })

test('an update is required only when a newer version can really be read', () => {
  assert.equal(updatePlan(v(3, '1.2'), v(4, '1.3')).state, 'update')
  assert.equal(updatePlan(v(4, '1.3'), v(4, '1.3')).state, 'latest')
  assert.equal(updatePlan(v(5, '1.4'), v(4, '1.3')).state, 'latest', 'never offers an older version')
  assert.equal(updatePlan(v(3, '1.2'), null).state, 'offline', 'no internet never locks the app')
  assert.equal(updatePlan(null, v(4, '1.3')).state, 'offline')
})

test('a failed download can be skipped, and only until trying again', async () => {
  let fail = Object.assign(new Error('Benarkan sumber ini'), { code: 'PERMISSION' })
  let exits = 0
  let time = 1000
  let checks = 0
  const u = createUpdater({ now: () => time, getInstalled: async () => v(3, '1.2'), getLatest: async () => { checks++; return v(4, '1.3') }, install: async () => { if (fail) throw fail }, getProgress: async () => ({ percent: 5 }), exit: async () => { exits++ } })
  await u.check()
  assert.equal(u.get().state, 'update')
  await u.install()
  assert.equal(u.get().sheet, 'permission')
  fail = new Error('Muat turun gagal (HTTP 500).')
  await u.install()
  assert.equal(u.get().sheet, 'error')
  u.useFirst()
  assert.equal(u.get().deferred, true)
  await u.check()
  assert.equal(u.get().deferred, true, 'a recheck does not lock it again')
  fail = null
  await u.install()
  assert.equal(u.get().deferred, false)
  assert.equal(u.get().sheet, 'install')
  await u.exit()
  assert.equal(exits, 1)
  const before = checks
  time += 60_000
  await u.recheck()
  assert.equal(checks, before, 'not before 5 minutes')
  time += 5 * 60_000
  await u.recheck()
  assert.equal(checks, before + 1)
})
