import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { WebSocketServer } from 'ws'
import pty from 'node-pty'
const port = Number(process.env.PORT || 5173)
const root = process.cwd()
const server = createServer(async (request, response) => {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`)
  const pathname = url.pathname
  const isAppRoute = pathname === '/' || pathname === '/index.html' || pathname === '/terminal-preview.html' || pathname.endsWith('/index.html')
  if (!isAppRoute) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    response.end('Not found')
    return
  }
  try {
    const page = await readFile(path.join(root, 'terminal-preview.html'))
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
    response.end(page)
  } catch {
    response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
    response.end('화면을 준비하지 못했습니다.')
  }
})
const sockets = new WebSocketServer({ noServer: true })
server.on('upgrade', (request, socket, head) => {
  if (new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`).pathname !== '/terminal') {
    socket.destroy()
    return
  }
  sockets.handleUpgrade(request, socket, head, (client) => sockets.emit('connection', client))
})
sockets.on('connection', (client) => {
  const shell = pty.spawn('/bin/bash', ['-i'], {
    name: 'xterm-256color',
    cols: 100,
    rows: 30,
    cwd: root,
    env: { ...process.env, TERM: 'xterm-256color' },
  })
  shell.onData((data) => {
    if (client.readyState === client.OPEN) client.send(data)
  })
  shell.onExit(() => client.close())
  client.on('message', (raw) => {
    try {
      const message = JSON.parse(raw.toString())
      if (message.type === 'input' && typeof message.data === 'string') shell.write(message.data)
      if (message.type === 'resize' && Number.isFinite(message.cols) && Number.isFinite(message.rows)) {
        shell.resize(Math.max(20, message.cols), Math.max(5, message.rows))
      }
    } catch { /* ignore malformed browser messages */ }
  })
  client.on('close', () => shell.kill())
})
server.listen(port, '0.0.0.0', () => console.log(`Terminal preview ready on port ${port}`))
