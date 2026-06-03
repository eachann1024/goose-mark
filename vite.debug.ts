/**
 * 可调试构建开关（与 goose 系列其它项目一致）。
 *
 * 用法：`GOOSE_DEBUG=1 bun run build` 产出带 sourcemap、未压缩的可调试产物，
 * devtools 可直读 src/ 源码；不设该变量则按各形态的正式策略压缩。
 *
 * 三种形态的 sourcemap 策略（见 memory vite8-rolldown-chunking）：
 *  - debug（GOOSE_DEBUG=1）   → sourcemap=true  + minify=false（两种形态都直读源码）
 *  - uTools 正式             → sourcemap='hidden'（写 .map 但 JS 无 //# 注释；随后由
 *                              scripts/utools-build.js 删除 .map，源码不外泄）
 *  - Tauri 正式              → sourcemap=false（Tauri 无打包前删 map 步骤，frontendDist
 *                              会把整个 dist 塞进 app 包；'hidden' 仍写盘 → 源码外泄+体积）
 */

/** 是否为可调试构建（环境变量 GOOSE_DEBUG=1 开启）。 */
export const isDebugBuild = process.env.GOOSE_DEBUG === '1'

/**
 * 是否为 Tauri 触发的构建。Tauri CLI 在 beforeBuildCommand 注入 TAURI_ENV_PLATFORM
 * （darwin/windows/linux），据此区分 Tauri 桌面壳构建与 uTools 插件构建。
 */
export const isTauriBuild = Boolean(process.env.TAURI_ENV_PLATFORM)

/** debug 时不压缩，便于断点与源码对照。 */
export const debugMinify = isDebugBuild ? false : ('esbuild' as const)

/**
 * sourcemap 策略：
 *  - debug：true（产物带 //# sourceMappingURL，devtools 直读 src/）
 *  - Tauri 正式：false（绝不写盘，避免随 app 包外泄源码）
 *  - uTools 正式：'hidden'（写 .map 供按需排错，JS 无注释，构建后脚本删除）
 */
export const debugSourcemap: boolean | 'hidden' = isDebugBuild
  ? true
  : isTauriBuild
    ? false
    : 'hidden'
