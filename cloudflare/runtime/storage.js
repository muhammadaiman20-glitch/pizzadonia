import { Buffer } from 'node:buffer'
import path from 'node:path'
const CHUNK = 256 * 1024
// Persistent SQLite files preserve the existing JSON business records and private uploads.
// Changes are staged per request and committed together; a failed handler cannot partially debit a wallet.
export class ShopFiles {
  constructor(storage) { this.storage = storage; this.sql = storage.sql; this.pending = new Map() }
  static initialize(sql) {
    sql.exec('CREATE TABLE IF NOT EXISTS files (path TEXT PRIMARY KEY, size INTEGER NOT NULL)')
    sql.exec('CREATE TABLE IF NOT EXISTS chunks (path TEXT NOT NULL, part INTEGER NOT NULL, data BLOB NOT NULL, PRIMARY KEY(path, part))')
    sql.exec('CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
  }
  key(p) {
    const k = path.posix.normalize(String(p))
    if (!k.startsWith('/data/')) throw new Error('Storage path outside shop data')
    return k
  }
  mkdirSync() {}
  existsSync(p) {
    const k = this.key(p)
    if (this.pending.has(k)) return this.pending.get(k) !== null
    return this.sql.exec('SELECT 1 FROM files WHERE path = ?', k).toArray().length > 0
  }
  readFileSync(p, encoding) {
    const k = this.key(p)
    let b
    if (this.pending.has(k)) b = this.pending.get(k)
    else {
      if (!this.existsSync(k)) throw new Error('ENOENT')
      b = Buffer.concat(this.sql.exec('SELECT data FROM chunks WHERE path = ? ORDER BY part', k).toArray().map(r => Buffer.from(r.data)))
    }
    if (b === null) throw new Error('ENOENT')
    return encoding ? b.toString(encoding) : Buffer.from(b)
  }
  writeFileSync(p, data) { this.pending.set(this.key(p), Buffer.isBuffer(data) ? Buffer.from(data) : Buffer.from(String(data))) }
  renameSync(a, b) { this.writeFileSync(b, this.readFileSync(a)); this.rmSync(a) }
  rmSync(p) { this.pending.set(this.key(p), null) }
  readdirSync(p) {
    const prefix = path.posix.normalize(String(p)) + '/'
    const names = new Set(this.sql.exec('SELECT path FROM files').toArray().map(r => r.path))
    for (const [key, b] of this.pending) b === null ? names.delete(key) : names.add(key)
    return [...new Set([...names].filter(k => k.startsWith(prefix)).map(k => k.slice(prefix.length).split('/')[0]))]
  }
  load(name, fallback) {
    const k = '/data/' + name
    if (!this.existsSync(k)) return structuredClone(fallback)
    return JSON.parse(this.readFileSync(k, 'utf8')) // Corrupt data must fail, never silently reset balances.
  }
  save(name, value) {
    const k = '/data/' + name
    const data = Buffer.from(JSON.stringify(value, null, 2))
    if (this.existsSync(k) && this.readFileSync(k).equals(data)) return
    this.pending.set(k, data)
  }
  commit() {
    this.storage.transactionSync(() => {
      for (const [key, data] of this.pending) {
        this.sql.exec('DELETE FROM chunks WHERE path = ?', key)
        if (data === null) this.sql.exec('DELETE FROM files WHERE path = ?', key)
        else {
          this.sql.exec('INSERT INTO files(path,size) VALUES (?,?) ON CONFLICT(path) DO UPDATE SET size=excluded.size', key, data.length)
          for (let offset = 0, part = 0; offset < data.length; offset += CHUNK, part++) {
            this.sql.exec('INSERT INTO chunks(path,part,data) VALUES (?,?,?)', key, part, data.subarray(offset, offset + CHUNK))
          }
        }
      }
    })
    this.pending.clear()
  }
  export() {
    return this.sql.exec('SELECT path FROM files ORDER BY path').toArray().map(r => ({ path: r.path.slice(6), data: this.readFileSync(r.path).toString('base64') }))
  }
}
