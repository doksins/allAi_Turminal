import { createServer } from 'node:http'
import { readFile, access } from 'node:fs/promises'
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { StringDecoder } from 'node:string_decoder'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { WebSocketServer, WebSocket } from 'ws'

const root = path.dirname(fileURLToPath(import.meta.url))
const cwd = process.cwd()
const port = Number(process.env.PORT || 5173)
const bind = process.env.TERMINAL_BIND || '0.0.0.0'
const token = process.env.TERMINAL_TOKEN || randomBytes(32).toString('hex')
if (!/^[A-Za-z0-9_-]{24,128}$/.test(token)) throw new Error('TERMINAL_TOKEN must be 24–128 URL-safe characters.')
const secret = Buffer.from(token)
const sessions = new Map()
const IDLE = 30 * 60_000
const LIMIT = 4
const MAX_OUTPUT = 1024 * 1024
const run = promisify(execFile)
let nativePty
try { nativePty = (await import('node-pty')).default } catch (error) {
  console.warn('node-pty unavailable; Python PTY fallback will be attempted:', error.message)
}
const shellEnv = Object.fromEntries(
  Object.entries(process.env).filter(([k]) => ['PATH','HOME','USER','LOGNAME','LANG','LC_ALL','LC_CTYPE','TZ'].includes(k))
)
shellEnv.TERM = 'xterm-256color'
shellEnv.SHELL = '/bin/bash'

function authorized(value) {
  const given = Buffer.from(typeof value === 'string' ? value : '')
  return given.length === secret.length && timingSafeEqual(given, secret)
}
function json(response, code, body) {
  response.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
  response.end(JSON.stringify(body))
}
function failure(code, message) { return Object.assign(new Error(message), { status: code }) }
async function body(request) {
  const chunks = []
  let length = 0
  for await (const part of request) {
    length += part.length
    if (length > 256 * 1024) throw failure(413, 'Request too large')
    chunks.push(part)
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') }
  catch { throw failure(400, 'Invalid JSON') }
}
function dimensions(value) {
  return { cols: Math.min(500, Math.max(20, Math.floor(Number(value.cols) || 100))),
    rows: Math.min(200, Math.max(5, Math.floor(Number(value.rows) || 30))) }
}
function pythonPty(cols, rows, output, exit) {
  const child = spawn('python3', [path.join(root, 'pty-bridge.py'), String(cols), String(rows)],
    { cwd, env: shellEnv, stdio: ['pipe','pipe','pipe'] })
  const decoder = new StringDecoder('utf8')
  child.stdout.on('data', chunk => output(decoder.write(chunk)))
  child.stderr.on('data', chunk => output(chunk.toString('utf8')))
  child.stdin.on('error', () => {})
  child.on('error', error => { output('\r\nPython PTY: ' + error.message + '\r\n'); exit(null) })
  child.on('close', code => { output(decoder.end()); exit(code) })
  const send = value => { if (child.stdin.writable) child.stdin.write(JSON.stringify(value) + '\n') }
  return { write: data => send({type:'input',data}), resize: (cols,rows) => send({type:'resize',cols,rows}),
    kill: () => { child.stdin.end(); child.kill('SIGTERM') } }
}
function snapshot(session, after) {
  const first = session.events[0]?.seq ?? session.seq + 1
  return { events: session.events.filter(event => event.seq > after), cursor: session.seq,
    truncated: after < first - 1, closed: session.closed, exitCode: session.exitCode, engine: session.engine }
}
function push(client, session) {
  if (client.readyState !== WebSocket.OPEN) return
  if (client.bufferedAmount > MAX_OUTPUT) { client.close(1013, 'Use HTTP polling'); return }
  const data = snapshot(session, client.cursor)
  client.send(JSON.stringify(data))
  client.cursor = data.cursor
}
function publish(session) { for (const client of session.clients) push(client, session) }
function createSession(size) {
  if (sessions.size >= LIMIT) throw failure(429, 'Too many sessions; close an existing terminal')
  const session = { id: randomBytes(24).toString('hex'), events: [], bytes: 0, seq: 0,
    closed: false, exitCode: null, touched: Date.now(), clients: new Set(), engine: 'node-pty' }
  const output = data => {
    if (!data) return
    // Split large chunks without splitting Unicode surrogate pairs.
    for (const chunk of data.match(/[\s\S]{1,16384}/gu) || []) {
      const bytes = Buffer.byteLength(chunk)
      session.events.push({seq: ++session.seq, data: chunk, bytes})
      session.bytes += bytes
    }
    while (session.bytes > MAX_OUTPUT && session.events.length > 1) session.bytes -= session.events.shift().bytes
    publish(session)
  }
  const exit = code => {
    if (session.closed) return
    session.closed = true
    session.exitCode = code
    publish(session)
  }
  try {
    if (!nativePty) throw new Error('node-pty unavailable')
    const pty = nativePty.spawn('/bin/bash', ['-i'], { name:'xterm-256color', ...size, cwd, env:shellEnv })
    pty.onData(output)
    pty.onExit(({exitCode}) => exit(exitCode))
    session.pty = pty
  } catch (error) {
    console.warn('Native PTY failed:', error.message)
    session.engine = 'python-pty'
    session.pty = pythonPty(size.cols, size.rows, output, exit)
  }
  sessions.set(session.id, session)
  return session
}
function destroy(session) {
  sessions.delete(session.id)
  if (!session.closed) { try { session.pty.kill() } catch {} }
  session.closed = true
  for (const client of session.clients) client.close(1000, 'Session ended')
}
const cleanup = setInterval(() => {
  for (const session of sessions.values()) if (Date.now() - session.touched > IDLE) destroy(session)
}, 30_000)
cleanup.unref()

const assets = {
  '/assets/xterm.js': ['node_modules/@xterm/xterm/lib/xterm.js', 'application/javascript; charset=utf-8'],
  '/assets/xterm.css': ['node_modules/@xterm/xterm/css/xterm.css', 'text/css; charset=utf-8'],
  '/assets/fit.js': ['node_modules/@xterm/addon-fit/lib/addon-fit.js', 'application/javascript; charset=utf-8'],
}
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || '/', 'http://localhost')
    const route = url.pathname
    const asset = Object.entries(assets).find(([suffix]) => route.endsWith(suffix))?.[1]
    if (asset && request.method === 'GET') {
      const data = await readFile(path.join(root, asset[0]))
      response.writeHead(200, {'Content-Type':asset[1], 'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'})
      response.end(data)
      return
    }
    const api = route.match(/\/api\/(status|session|output|input|resize|close)$/)
    if (api) {
      if (!authorized(request.headers['x-terminal-token'])) return json(response,401,{error:'Invalid terminal token'})
      if (api[1] === 'status' && request.method === 'GET') {
        let bashAvailable = true, repository = ''
        try { await access('/bin/bash', 1) } catch { bashAvailable = false }
        try {
          const {stdout} = await run('git', ['remote','get-url','origin'], {cwd, timeout:3000})
          repository = stdout.trim().match(/github\.com[/:]([\w.-]+\/[\w.-]+?)(?:\.git)?$/)?.[1] || ''
        } catch {}
        return json(response,200,{bashAvailable,github:{configured:!!repository,repository},nativePty:!!nativePty})
      }
      if (api[1] === 'session' && request.method === 'POST') {
        const size = dimensions(await body(request))
        try { await access('/bin/bash', 1) } catch { throw failure(503,'Bash not found; install bash') }
        const session = createSession(size)
        return json(response,201,{id:session.id,engine:session.engine})
      }
      const id = request.headers['x-terminal-session']
      const session = sessions.get(id)
      if (!session) throw failure(404,'Terminal session expired or not found')
      session.touched = Date.now()
      if (api[1] === 'output' && request.method === 'GET') {
        const after = Math.max(0, Number(url.searchParams.get('after')) || 0)
        return json(response,200,snapshot(session,after))
      }
      if (request.method !== 'POST') throw failure(405,'Method not allowed')
      if (api[1] === 'close') { destroy(session); return json(response,200,{ok:true}) }
      if (session.closed) throw failure(410,'Shell exited')
      const value = await body(request)
      if (api[1] === 'input') {
        if (typeof value.data !== 'string' || value.data.length > 65536) throw failure(400,'Invalid input')
        session.pty.write(value.data)
      } else if (api[1] === 'resize') {
        const size = dimensions(value)
        session.pty.resize(size.cols,size.rows)
      } else throw failure(404,'Unknown route')
      return json(response,200,{ok:true})
    }
    if (request.method !== 'GET') throw failure(404,'Unknown route')
    if (/\.(js|css|map|ico|png|svg)$/i.test(route)) throw failure(404,'Asset not found')
    const page = await readFile(path.join(root,'terminal-preview.html'))
    response.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
      'Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws: wss:; font-src 'self' data:; object-src 'none'; base-uri 'self'"})
    response.end(page)
  } catch (error) {
    if (!response.headersSent) json(response,error.status || 500,{error:error.status ? error.message : 'Server error; check server logs'})
    else response.end()
    if (!error.status) console.error(error)
  }
})
const sockets = new WebSocketServer({noServer:true,maxPayload:1024,handleProtocols:protocols => protocols.has('terminal-v1') ? 'terminal-v1' : false})
server.on('upgrade', (request, socket, head) => {
  const pathname = new URL(request.url || '/', 'http://localhost').pathname
  const protocols = String(request.headers['sec-websocket-protocol'] || '').split(',').map(s => s.trim())
  const credential = protocols.find(s => s.startsWith('auth.'))?.slice(5)
  const id = protocols.find(s => s.startsWith('session.'))?.slice(8)
  const session = sessions.get(id)
  if (!pathname.endsWith('/terminal') || !protocols.includes('terminal-v1') || !authorized(credential) || !session) {
    socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n')
    return
  }
  const cursor = Math.max(0, Number(protocols.find(s => s.startsWith('after.'))?.slice(6)) || 0)
  sockets.handleUpgrade(request,socket,head,client => {
    client.cursor = cursor
    session.clients.add(client)
    client.on('close', () => session.clients.delete(client))
    client.on('error', () => session.clients.delete(client))
    push(client,session)
  })
})
server.listen(port,bind,() => {
  console.log('Terminal preview ready on ' + bind + ':' + port)
  if (!process.env.TERMINAL_TOKEN) console.log('Terminal login token (keep private): ' + token)
  else console.log('Terminal login requires configured TERMINAL_TOKEN.')
  console.log('Use HTTPS/authenticated preview or private port forwarding; never expose raw HTTP publicly.')
})
for (const signal of ['SIGINT','SIGTERM']) process.on(signal,() => {
  for (const session of sessions.values()) destroy(session)
  sockets.close()
  server.close()
  setTimeout(() => process.exit(0),1000).unref()
})
