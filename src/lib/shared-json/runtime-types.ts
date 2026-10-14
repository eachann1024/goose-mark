import type { Source } from './folder'
export type Connection = Source & { file: string; epoch: number }
