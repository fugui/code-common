/**
 * Vite 构建插件：自动注入版本元数据（version.json）
 * 提取 Git Commit Hash + 确定性时间戳，输出至 public/ 与 dist/ 目录
 *
 * ⚠️ 此模块依赖 Node.js 运行时（child_process / fs），仅供各子系统 vite.config.ts 构建期引用
 * 严禁从 @code/common 浏览器端入口导出，确保构建环境与运行环境的物理隔离
 */
import type { Plugin } from 'vite'
import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'

export interface VersionPluginOptions {
  appName?: string
}

export function versionTrackerPlugin(options: VersionPluginOptions = {}): Plugin {
  const getVersionData = () => {
    let gitHash = 'unknown'
    try {
      gitHash = execSync('git rev-parse --short HEAD').toString().trim()
    } catch {
      // 兼容无 Git 环境
    }

    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    const buildTime = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
    const timestamp = now.getTime()

    return {
      appName: options.appName || process.env.npm_package_name || 'app',
      version: process.env.npm_package_version || '1.0.0',
      gitHash,
      buildTime,
      timestamp,
    }
  }

  const writeVersionFile = (rootDir: string) => {
    try {
      const data = JSON.stringify(getVersionData(), null, 2)
      const publicDir = path.resolve(rootDir, 'public')
      if (!fs.existsSync(publicDir)) {
        fs.mkdirSync(publicDir, { recursive: true })
      }
      fs.writeFileSync(path.join(publicDir, 'version.json'), data)

      const distDir = path.resolve(rootDir, 'dist')
      if (fs.existsSync(distDir)) {
        fs.writeFileSync(path.join(distDir, 'version.json'), data)
      }
    } catch (e) {
      console.error('Failed to write version.json:', e)
    }
  }

  return {
    name: 'vite-plugin-version-tracker',
    buildStart() {
      writeVersionFile(process.cwd())
    },
    closeBundle() {
      writeVersionFile(process.cwd())
    },
  }
}
