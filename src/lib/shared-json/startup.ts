import { modules } from './files'
import { identifySource, type Source } from './folder'

export function defaultSourcePath() {
  const documents = window.utools?.getPath('documents')
  if (!documents) throw new Error('无法获取用户文档目录')
  return modules().path.join(documents, 'goose-marks')
}
export async function startupSource(savedPath: string): Promise<Source> {
  return identifySource(savedPath)
}
