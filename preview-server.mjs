import { createServer } from 'node:http'
import { access } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { execFileSync } from 'node:child_process'
import { WebSocketServer } from 'ws'
import pty from 'node-pty'

const port = Number(process.env.PORT || 5173)
const root = process.cwd()

const readGitHubStatus = () => {
  try {
    const remote = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: root, encoding: 'utf8' }).trim()
    const match = remote.match(/github\.com[/:]([^/]+\/[^/.]+)(?:\.git)?$/)
    return {
      configured: true,
      repository: match?.[1] || remote,
      message: '원격 저장소가 연결되어 있습니다.',
    }
  } catch {
    return { configured: false, repository: '', message: '원격 저장소가 연결되어 있지 않습니다.' }
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`)
  const pathname = url.pathname

  if (pathname.endsWith('/api/status')) {
    const github = readGitHubStatus()
    let bashAvailable = true
    try { await access('/bin/bash') } catch { bashAvailable = false }
    response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
    response.end(JSON.stringify({ github, bashAvailable }))
    return
  }

  if (/\.(?:js|css|map|ico|png|svg)$/i.test(pathname)) {
    response.writeHead(204, { 'Cache-Control': 'no-store' })
    response.end()
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
  const pathname = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`).pathname
  if (!pathname.endsWith('/terminal')) {
    socket.destroy()
    return
  }
  sockets.handleUpgrade(request, socket, head, (client) => sockets.emit('connection', client))
})

sockets.on('connection', (client) => {
  let shell
  try {
    shell = pty.spawn('/bin/bash', ['-i'], {
      name: 'xterm-256color',
      cols: 100,
      rows: 30,
      cwd: root,
      env: { ...process.env, TERM: 'xterm-256color' },
    })
  } catch (error) {
    client.send(`\r\n터미널을 시작하지 못했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}\r\n`)
    client.close()
    return
  }

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
    } catch { /* malformed browser messages are ignored */ }
  })
  client.on('close', () => shell.kill())
})

server.listen(port, '0.0.0.0', () => console.log(`Terminal preview ready on port ${port}`))
