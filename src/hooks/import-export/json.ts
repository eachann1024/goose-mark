import type { JsonImportResult } from './types'
import { asObject } from './validation'
import { normalizeSystemBackup } from './system-backup'
import { isUrlWizardPayload, normalizeUrlWizardPayload } from './url-wizard'


export const parseJsonImportText = (text: string): JsonImportResult => {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return {
      ok: false,
      message: 'JSON 解析失败，请检查文件格式是否完整'
    }
  }

  const payload = asObject(parsed)
  if (!payload) {
    return {
      ok: false,
      message: '无效的 JSON 结构'
    }
  }

  if (Array.isArray(payload.groups) && Array.isArray(payload.bookmarks)) {
    return normalizeSystemBackup(payload)
  }

  if (isUrlWizardPayload(payload)) {
    return normalizeUrlWizardPayload(payload)
  }

  return {
    ok: false,
    message: '暂不支持该 JSON 格式。请使用鹅的书签备份 JSON 或网址精灵导出的 data.json'
  }
}
