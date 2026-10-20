/** 同一书签可出现在多个位置，拖拽注册必须按位置区分。 */
export function bookmarkDragId(groupId: string, subId: string, bookmarkId: string): string {
  return JSON.stringify(['bookmark', groupId, subId, bookmarkId])
}
