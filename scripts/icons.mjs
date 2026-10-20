import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const root = path.resolve(import.meta.dirname, '..')
const source = await readFile(path.join(root, 'public', 'favicon.svg'))
const output = path.join(root, 'public', 'icons')

await mkdir(output, { recursive: true })

const targets = [
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-512.png', size: 512 },
  { file: 'icon-maskable-512.png', size: 512 },
  { file: 'apple-touch-icon.png', size: 180 },
]

for (const target of targets) {
  await sharp(source)
    .resize(target.size, target.size)
    .png()
    .toFile(path.join(output, target.file))
  console.log(`created public/icons/${target.file}`)
}
