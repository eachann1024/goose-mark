import { type AggressiveAiSaveFailure, type AggressiveAiSavePhase, type AggressiveAiSaveResult } from '@/services/aggressiveAiSave'

/**
 * HomePage —— 「鹅的书签 · 配色改造预览.html」的 1:1 React 还原。
 * --------------------------------------------------------------------------
 * 严格对照设计稿 HTML 结构 + app.js 交互重写为新首页：
 *   - 顶栏：搜索框（聚焦→搜索浮层）/ 列表·网格切换 / 新增 / 设置 / 明暗
 *   - 侧栏：分组→子分组导航 + 回收站
 *   - 中栏：列表卡（分段标题）/ 网格卡
 *   - 浮层：搜索(⌘K) / 新增·编辑表单页 / 设置页 / 右键菜单 / 复制 Toast
 * 数据接真实 bookmark store（store 自带 seed 数据，非空）；
 * 业务动作（真实打开/保存/删除/AI）按要求先移除，仅保留界面交互态。
 * 明暗用根容器 data-theme 控制，配色全部来自 home.css 的独立 CSS 变量。
 */

export type Screen = 'list' | 'grid' | 'add' | 'settings' | 'trash' | 'groups' | 'ai-aggressive-save'


export type ViewMode = 'list' | 'grid'


export type Theme = 'light' | 'dark'


export type ThemePref = 'light' | 'dark' | 'system'


export type CtxMode = 'menu' | 'confirmDelete'



export interface CtxState {
  open: boolean
  x: number
  y: number
}



export type AggressiveSaveJob = {
  id: number
  url: string
  host: string
  phase: AggressiveAiSavePhase | 'queued'
  detail: string
  status: 'queued' | 'running'
}



export type AggressiveSaveSuccess = {
  id: number
  result: AggressiveAiSaveResult
}



export type AggressiveSaveFailure = AggressiveAiSaveFailure & {
  id: number
  url: string
  host: string
}



export type ToastTone = 'success' | 'error'


export type ToastAction = 'open-ai-save' | null
