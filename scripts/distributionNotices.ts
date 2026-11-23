import { existsSync } from 'node:fs'
import { readFile, readdir } from 'node:fs/promises'
import { relative, resolve } from 'node:path'
import { normalizePath, type Plugin } from 'vite'

const projectFiles = [
  'LICENSE', 'COPYING', 'COPYING.LESSER', 'NOTICE', 'THIRD_PARTY_NOTICES.md',
  'README.md', 'package.json', 'pnpm-lock.yaml',
]

/** Preserve relative links between the notices, license texts and build inputs. */
export function distributionNotices(projectRoot: string): Plugin {
  return {
    name: 'distribution-notices',
    apply: 'build',
    async buildStart() {
      const files = projectFiles.map((name) => resolve(projectRoot, name)).filter(existsSync)
      const licenseDir = resolve(projectRoot, 'licenses')
      if (existsSync(licenseDir)) {
        for (const entry of await readdir(licenseDir, { withFileTypes: true, recursive: true })) {
          if (entry.isFile()) files.push(resolve(entry.parentPath, entry.name))
        }
      }
      for (const file of files) {
        this.addWatchFile(file)
        const name = normalizePath(relative(projectRoot, file))
        this.emitFile({ type: 'asset', fileName: 'licenses/' + name, source: await readFile(file) })
      }
    },
  }
}
