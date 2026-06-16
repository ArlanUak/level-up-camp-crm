import { spawn } from 'node:child_process'

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const children = [
  spawn(npmCommand, ['run', 'dev:server'], { stdio: 'inherit' }),
  spawn(npmCommand, ['run', 'dev:client'], { stdio: 'inherit' }),
]

function stop(code = 0) {
  for (const child of children) child.kill('SIGTERM')
  process.exit(code)
}

for (const child of children) {
  child.on('exit', (code) => {
    if (code && code !== 0) stop(code)
  })
}

process.on('SIGINT', () => stop(0))
process.on('SIGTERM', () => stop(0))
