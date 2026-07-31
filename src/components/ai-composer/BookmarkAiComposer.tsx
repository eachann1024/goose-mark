import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState
} from 'react'
import { useBookmarkStore } from '@/stores/bookmark'
import { useSettingsStore } from '@/stores/settings'
import {
  BUILTIN_BOOKMARK_AI_SKILLS,
  buildBookmarkAiComposerPayload,
  getBookmarkAiLocalSkillScan,
  getBookmarkAiReferenceSuggestions,
  getBookmarkAiSkillSuggestions,
  parseBookmarkAiLocalSkills,
  validateBookmarkAiReferences,
  type BookmarkAiComposerPayload,
  type BookmarkAiComposerToken,
  type BookmarkAiImageAttachment,
  type BookmarkAiReference,
  type BookmarkAiReferenceValidation,
  type BookmarkAiSkillCommand
} from '@/lib/bookmarkAiContext'
import { SuggestionList, type BookmarkAiSuggestionItem } from './SuggestionList'
import {
  BOOKMARK_AI_IMAGE_MAX_COUNT,
  BOOKMARK_AI_IMAGE_TYPES,
  prepareBookmarkAiImages,
  resolveBookmarkAiImageSha256,
  type BookmarkAiPreparedImages
} from './imageAttachments'

interface DetectedTrigger {
  type: 'reference' | 'skill'
  query: string
  range: Range
  anchorRect: DOMRect
}

interface MenuState extends DetectedTrigger {
  activeIndex: number
}

export interface BookmarkAiComposerHandle {
  focus: () => void
  clear: () => void
  getPayload: () => BookmarkAiComposerPayload
  validateReferences: () => BookmarkAiReferenceValidation
  insertReference: (reference: BookmarkAiReference) => void
  addImages: (files: readonly File[]) => Promise<BookmarkAiPreparedImages>
  removeImage: (imageId: string) => void
  isProcessingImages: () => boolean
}

export interface BookmarkAiComposerProps {
  /** 仅首次挂载时写入，避免受控回灌破坏 contenteditable 选区。 */
  initialText?: string
  placeholder?: string
  disabled?: boolean
  autoFocus?: boolean
  className?: string
  ariaLabel?: string
  onChange?: (payload: BookmarkAiComposerPayload) => void
  onSubmit?: (payload: BookmarkAiComposerPayload) => void
  onEscape?: () => void
  onImageError?: (message: string) => void
}

const CHIP_SELECTOR = '[data-bookmark-ai-reference]'

function createReferenceChip(reference: BookmarkAiReference) {
  const chip = document.createElement('span')
  chip.contentEditable = 'false'
  chip.className = `bookmark-ai-composer-chip is-${reference.kind}`
  chip.dataset.bookmarkAiReference = JSON.stringify(reference)
  chip.dataset.bookmarkAiReferenceKey = `${reference.kind}:${reference.id}`
  chip.setAttribute('aria-label', `${reference.kind === 'bookmark' ? '书签' : '分组'}引用：${reference.titleSnapshot}`)
  chip.textContent = `@${reference.titleSnapshot}`
  return chip
}

function appendTextToken(tokens: BookmarkAiComposerToken[], text: string) {
  if (!text) return
  const last = tokens.at(-1)
  if (last?.type === 'text') last.text += text
  else tokens.push({ type: 'text', text })
}

export function readBookmarkAiComposerTokens(editor: HTMLElement): BookmarkAiComposerToken[] {
  const tokens: BookmarkAiComposerToken[] = []
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      appendTextToken(tokens, node.textContent ?? '')
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return
    const element = node as HTMLElement
    if (element.matches(CHIP_SELECTOR)) {
      try {
        const reference = JSON.parse(element.dataset.bookmarkAiReference ?? '') as BookmarkAiReference
        if (reference.id && reference.kind) tokens.push({ type: 'reference', reference })
      } catch {
        // A damaged DOM chip is ignored instead of leaking its JSON into the prompt.
      }
      return
    }
    if (element.tagName === 'BR') {
      appendTextToken(tokens, '\n')
      return
    }
    const before = tokens.length
    element.childNodes.forEach(walk)
    if (element !== editor && element.tagName === 'DIV' && tokens.length > before) {
      appendTextToken(tokens, '\n')
    }
  }
  editor.childNodes.forEach(walk)
  const last = tokens.at(-1)
  if (last?.type === 'text') last.text = last.text.replace(/\n+$/, '')
  return tokens.filter((token) => token.type !== 'text' || token.text.length > 0)
}

function getSkills(readLocalSkills: boolean) {
  if (!readLocalSkills) return [...BUILTIN_BOOKMARK_AI_SKILLS]
  return [...BUILTIN_BOOKMARK_AI_SKILLS, ...parseBookmarkAiLocalSkills(getBookmarkAiLocalSkillScan())]
}

interface CharacterPoint {
  value: string
  node: Text
  offset: number
}

function scanSegmentToCaret(editor: HTMLElement, anchor: Node, anchorOffset: number) {
  let stopped = false
  let segment: CharacterPoint[] = []

  const reset = () => { segment = [] }
  const visit = (node: Node) => {
    if (stopped) return
    if (node === anchor) {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node as Text
        const limit = Math.min(anchorOffset, text.data.length)
        for (let index = 0; index < limit; index += 1) {
          segment.push({ value: text.data[index], node: text, offset: index })
        }
      } else {
        const element = node as Element
        Array.from(element.childNodes).slice(0, anchorOffset).forEach(visit)
      }
      stopped = true
      return
    }
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node as Text
      for (let index = 0; index < text.data.length; index += 1) {
        segment.push({ value: text.data[index], node: text, offset: index })
      }
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return
    const element = node as HTMLElement
    if (element.matches(CHIP_SELECTOR) || element.tagName === 'BR') {
      reset()
      return
    }
    element.childNodes.forEach(visit)
  }
  visit(editor)
  return stopped ? segment : []
}

function resolveAnchorRect(range: Range, editor: HTMLElement) {
  const rect = range.getBoundingClientRect()
  if (rect.width || rect.height) return rect
  const clientRect = range.getClientRects()[0]
  return clientRect && (clientRect.width || clientRect.height) ? clientRect : editor.getBoundingClientRect()
}

function detectTriggerAtCaret(editor: HTMLElement): DetectedTrigger | null {
  const selection = window.getSelection()
  if (!selection?.isCollapsed || !selection.anchorNode || !editor.contains(selection.anchorNode)) return null
  const points = scanSegmentToCaret(editor, selection.anchorNode, selection.anchorOffset)
  const text = points.map((point) => point.value).join('')
  const candidates: Array<{ type: DetectedTrigger['type']; index: number; query: string }> = []
  const reference = text.match(/(?:^|\s)@([^\s@]*)$/)
  if (reference && reference.index !== undefined) {
    candidates.push({
      type: 'reference',
      index: reference.index + (reference[0].startsWith('@') ? 0 : 1),
      query: reference[1]
    })
  }
  const skill = text.match(/\/([^\s/]*)$/)
  if (skill && skill.index !== undefined) {
    const beforeRange = document.createRange()
    beforeRange.selectNodeContents(editor)
    const slashPoint = points[skill.index]
    if (slashPoint) {
      beforeRange.setEnd(slashPoint.node, slashPoint.offset)
      if (!beforeRange.toString().trim()) {
        candidates.push({ type: 'skill', index: skill.index, query: skill[1] })
      }
    }
  }
  const candidate = candidates.sort((a, b) => b.index - a.index)[0]
  const start = candidate ? points[candidate.index] : undefined
  if (!candidate || !start) return null
  const range = document.createRange()
  try {
    range.setStart(start.node, start.offset)
    range.setEnd(selection.anchorNode, selection.anchorOffset)
  } catch {
    return null
  }
  return { ...candidate, range, anchorRect: resolveAnchorRect(range, editor) }
}

function placeCaret(editor: HTMLElement, node: Node, offset: number) {
  editor.focus()
  const selection = window.getSelection()
  const range = document.createRange()
  range.setStart(node, offset)
  range.collapse(true)
  selection?.removeAllRanges()
  selection?.addRange(range)
}

function insertFragmentAtRange(editor: HTMLElement, range: Range, fragment: DocumentFragment, caret: Text) {
  try {
    range.deleteContents()
    range.insertNode(fragment)
    placeCaret(editor, caret, caret.length)
    return true
  } catch {
    return false
  }
}

function closestReferenceChip(node: Node | null): HTMLElement | null {
  if (!node) return null
  const element = node.nodeType === Node.ELEMENT_NODE ? node as HTMLElement : node.parentElement
  return element?.closest<HTMLElement>(CHIP_SELECTOR) ?? null
}

function deepest(node: Node | null, direction: 'first' | 'last'): Node | null {
  let current = node
  while (current?.childNodes.length) {
    current = direction === 'first' ? current.firstChild : current.lastChild
  }
  return current
}

function siblingFromPoint(
  editor: HTMLElement,
  anchor: Node,
  offset: number,
  direction: 'previous' | 'next'
): Node | null {
  if (anchor.nodeType === Node.TEXT_NODE) {
    const text = anchor as Text
    if (direction === 'previous' && offset > 0) {
      if (!/^\s*$/.test(text.data.slice(0, offset))) return null
      let node: Node | null = text.previousSibling
      if (!node) {
        let parent: Node | null = text.parentNode
        while (parent && parent !== editor && !parent.previousSibling) parent = parent.parentNode
        node = parent === editor ? null : parent?.previousSibling ?? null
      }
      return deepest(node, 'last')
    }
    if (direction === 'next' && offset < text.data.length) {
      if (!/^\s*$/.test(text.data.slice(offset))) return null
      return deepest(text.nextSibling, 'first')
    }
  }
  if (anchor.nodeType === Node.ELEMENT_NODE) {
    const childIndex = direction === 'previous' ? offset - 1 : offset
    const child = anchor.childNodes[childIndex]
    if (child) return deepest(child, direction === 'previous' ? 'last' : 'first')
  }
  let current: Node | null = anchor
  while (current && current !== editor) {
    const sibling = direction === 'previous' ? current.previousSibling : current.nextSibling
    if (sibling) return deepest(sibling, direction === 'previous' ? 'last' : 'first')
    current = current.parentNode
  }
  return null
}

function removeAdjacentChip(editor: HTMLElement, direction: 'previous' | 'next') {
  const selection = window.getSelection()
  if (!selection?.isCollapsed || !selection.anchorNode || !editor.contains(selection.anchorNode)) return false
  const anchor = selection.anchorNode
  const offset = selection.anchorOffset
  let candidate = siblingFromPoint(editor, anchor, offset, direction)
  if (candidate?.nodeType === Node.TEXT_NODE && /^\s*$/.test(candidate.textContent ?? '')) {
    candidate = siblingFromPoint(
      editor,
      candidate,
      direction === 'previous' ? (candidate.textContent?.length ?? 0) : 0,
      direction
    )
  }
  const chip = closestReferenceChip(candidate)
  if (!chip || !editor.contains(chip)) return false
  const parent = chip.parentNode
  if (!parent) return false
  const chipIndex = Array.prototype.indexOf.call(parent.childNodes, chip) as number
  const spacer = direction === 'previous' ? chip.nextSibling : chip.previousSibling
  if (spacer?.nodeType === Node.TEXT_NODE && spacer.textContent === ' ') spacer.remove()
  chip.remove()
  const caretOffset = Math.min(chipIndex, parent.childNodes.length)
  placeCaret(editor, parent, caretOffset)
  return true
}

function insertPlainText(editor: HTMLElement, text: string) {
  if (!text) return false
  const selection = window.getSelection()
  if (!selection || !selection.rangeCount || !selection.anchorNode || !editor.contains(selection.anchorNode)) return false
  const range = selection.getRangeAt(0)
  range.deleteContents()
  const node = document.createTextNode(text.replace(/\r\n?/g, '\n'))
  range.insertNode(node)
  placeCaret(editor, node, node.length)
  return true
}

export const BookmarkAiComposer = forwardRef<BookmarkAiComposerHandle, BookmarkAiComposerProps>(
  function BookmarkAiComposer(
    {
      initialText = '',
      placeholder = '向 AI 提问，/ 调用 Skill，@ 引用书签或分组…',
      disabled = false,
      autoFocus = false,
      className = '',
      ariaLabel = 'AI 输入',
      onChange,
      onSubmit,
      onEscape,
      onImageError
    },
    ref
  ) {
    const editorRef = useRef<HTMLDivElement>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const initialTextAppliedRef = useRef(false)
    const composingRef = useRef(false)
    const processingImagesRef = useRef(false)
    const imagesRef = useRef<BookmarkAiImageAttachment[]>([])
    const triggerRef = useRef<DetectedTrigger | null>(null)
    const [menu, setMenu] = useState<MenuState | null>(null)
    const [isEmpty, setIsEmpty] = useState(true)
    const [images, setImages] = useState<BookmarkAiImageAttachment[]>([])
    const [isProcessingImages, setIsProcessingImages] = useState(false)
    const bookmarks = useBookmarkStore((state) => state.bookmarks)
    const groups = useBookmarkStore((state) => state.groups)
    const activeGroupId = useBookmarkStore((state) => state.activeGroupId)
    const activeSubGroupId = useBookmarkStore((state) => state.activeSubGroupId)
    const isBookmarkInTrash = useBookmarkStore((state) => state.isBookmarkInTrash)
    const readLocalSkills = useSettingsStore((state) => state.readLocalSkills)
    const library = useMemo(() => ({
      bookmarks,
      groups,
      activeGroupId,
      activeSubGroupId,
      isBookmarkInTrash
    }), [activeGroupId, activeSubGroupId, bookmarks, groups, isBookmarkInTrash])

    const skills = useMemo(() => getSkills(readLocalSkills), [readLocalSkills, menu?.type, menu?.query])
    const referenceItems = useMemo(
      () => menu?.type === 'reference' ? getBookmarkAiReferenceSuggestions(menu.query, library) : [],
      [library, menu?.query, menu?.type]
    )
    const skillResult = useMemo(
      () => menu?.type === 'skill'
        ? getBookmarkAiSkillSuggestions(menu.query, { readLocalSkills })
        : { items: [] as BookmarkAiSkillCommand[], scan: { status: 'ready' as const, skills: [] } },
      [menu?.query, menu?.type, readLocalSkills]
    )
    const suggestionItems: BookmarkAiSuggestionItem[] = menu?.type === 'reference'
      ? referenceItems.map((value) => ({ type: 'reference' as const, value }))
      : skillResult.items.map((value) => ({ type: 'skill' as const, value }))

    const getPayload = useCallback(() => {
      const editor = editorRef.current
      return buildBookmarkAiComposerPayload(
        editor ? readBookmarkAiComposerTokens(editor) : [],
        skills,
        imagesRef.current
      )
    }, [skills])

    const emitChange = useCallback(() => {
      const payload = getPayload()
      setIsEmpty(payload.promptText.length === 0 && payload.images.length === 0)
      onChange?.(payload)
    }, [getPayload, onChange])

    const updateImages = useCallback((next: BookmarkAiImageAttachment[]) => {
      imagesRef.current = next
      setImages(next)
    }, [])

    const addImages = useCallback(async (files: readonly File[]) => {
      if (disabled || files.length === 0) return { accepted: [], rejected: [] }
      if (processingImagesRef.current) {
        const message = '正在处理已选择的图片，请稍候'
        onImageError?.(message)
        return {
          accepted: [],
          rejected: files.map((file) => ({
            fileName: file.name || '图片',
            reason: 'read-failed' as const,
            message
          }))
        }
      }
      processingImagesRef.current = true
      setIsProcessingImages(true)
      try {
        const prepared = await prepareBookmarkAiImages(files, imagesRef.current)
        prepared.rejected.forEach((failure) => onImageError?.(failure.message))
        if (prepared.accepted.length === 0) return prepared

        const next = [...imagesRef.current, ...prepared.accepted]
        updateImages(next)
        emitChange()

        const targetIds = new Set(prepared.accepted.map((image) => image.id))
        const resolved = await resolveBookmarkAiImageSha256(next, targetIds)
        updateImages(resolved.images)
        if (resolved.duplicates.length > 0) {
          onImageError?.(`检测到 ${resolved.duplicates.length} 张重复图片，已移除后加入的副本`)
        }
        emitChange()
        return {
          ...prepared,
          accepted: resolved.images.filter((image) => targetIds.has(image.id))
        }
      } finally {
        processingImagesRef.current = false
        setIsProcessingImages(false)
      }
    }, [disabled, emitChange, onImageError, updateImages])

    const removeImage = useCallback((imageId: string) => {
      if (processingImagesRef.current) {
        onImageError?.('图片仍在处理中，请稍候再移除')
        return
      }
      const next = imagesRef.current.filter((image) => image.id !== imageId)
      if (next.length === imagesRef.current.length) return
      updateImages(next)
      emitChange()
      editorRef.current?.focus()
    }, [emitChange, onImageError, updateImages])

    const detectMenu = useCallback(() => {
      const editor = editorRef.current
      if (!editor || composingRef.current) return
      const detected = detectTriggerAtCaret(editor)
      triggerRef.current = detected
      if (!detected) {
        setMenu(null)
        return
      }
      setMenu((previous) => ({
        ...detected,
        activeIndex: previous?.type === detected.type && previous.query === detected.query
          ? previous.activeIndex
          : 0
      }))
    }, [])

    const insertReference = useCallback((reference: BookmarkAiReference) => {
      const editor = editorRef.current
      if (!editor) return
      const selection = window.getSelection()
      let range = triggerRef.current?.type === 'reference' ? triggerRef.current.range : null
      if (!range && selection?.rangeCount && selection.anchorNode && editor.contains(selection.anchorNode)) {
        range = selection.getRangeAt(0)
      }
      if (!range) {
        range = document.createRange()
        range.selectNodeContents(editor)
        range.collapse(false)
      }
      const spacer = document.createTextNode(' ')
      const fragment = document.createDocumentFragment()
      fragment.append(createReferenceChip(reference), spacer)
      setMenu(null)
      triggerRef.current = null
      if (insertFragmentAtRange(editor, range, fragment, spacer)) emitChange()
    }, [emitChange])

    const insertSkill = useCallback((skill: BookmarkAiSkillCommand) => {
      const editor = editorRef.current
      const range = triggerRef.current?.type === 'skill' ? triggerRef.current.range : null
      if (!editor || !range) return
      const command = document.createTextNode(`/${skill.command} `)
      const fragment = document.createDocumentFragment()
      fragment.append(command)
      setMenu(null)
      triggerRef.current = null
      if (insertFragmentAtRange(editor, range, fragment, command)) emitChange()
    }, [emitChange])

    const selectSuggestion = useCallback((item: BookmarkAiSuggestionItem) => {
      if (item.type === 'reference') insertReference(item.value)
      else insertSkill(item.value)
    }, [insertReference, insertSkill])

    useImperativeHandle(ref, () => ({
      focus: () => {
        const editor = editorRef.current
        if (!editor) return
        const range = document.createRange()
        range.selectNodeContents(editor)
        range.collapse(false)
        placeCaret(editor, range.endContainer, range.endOffset)
      },
      clear: () => {
        const editor = editorRef.current
        if (editor) editor.replaceChildren()
        updateImages([])
        triggerRef.current = null
        setMenu(null)
        setIsEmpty(true)
        onChange?.(buildBookmarkAiComposerPayload([], skills, []))
      },
      getPayload,
      validateReferences: () => validateBookmarkAiReferences(getPayload().references, library),
      insertReference,
      addImages,
      removeImage,
      isProcessingImages: () => processingImagesRef.current
    }), [addImages, getPayload, insertReference, library, onChange, removeImage, skills, updateImages])

    useEffect(() => {
      if (initialTextAppliedRef.current) return
      const editor = editorRef.current
      if (!editor) return
      initialTextAppliedRef.current = true
      if (initialText) editor.appendChild(document.createTextNode(initialText.replace(/\r\n?/g, '\n')))
      const payload = getPayload()
      setIsEmpty(payload.promptText.length === 0)
    }, [getPayload, initialText])

    useEffect(() => {
      if (autoFocus && !disabled) requestAnimationFrame(() => editorRef.current?.focus())
    }, [autoFocus, disabled])

    const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.nativeEvent.isComposing || composingRef.current || event.keyCode === 229) return
      if (menu) {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault()
          if (suggestionItems.length > 0) {
            const delta = event.key === 'ArrowDown' ? 1 : -1
            setMenu((current) => current ? {
              ...current,
              activeIndex: (current.activeIndex + delta + suggestionItems.length) % suggestionItems.length
            } : null)
          }
          return
        }
        if (event.key === 'Enter' && !event.shiftKey && suggestionItems.length > 0) {
          event.preventDefault()
          selectSuggestion(suggestionItems[Math.min(menu.activeIndex, suggestionItems.length - 1)])
          return
        }
        if (event.key === 'Escape') {
          event.preventDefault()
          triggerRef.current = null
          setMenu(null)
          return
        }
        if (event.key === 'Enter' && suggestionItems.length === 0) {
          triggerRef.current = null
          setMenu(null)
        }
      }
      const editor = editorRef.current
      if (editor && (event.key === 'Backspace' || event.key === 'Delete')) {
        const removed = removeAdjacentChip(editor, event.key === 'Backspace' ? 'previous' : 'next')
        if (removed) {
          event.preventDefault()
          emitChange()
          detectMenu()
          return
        }
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        onEscape?.()
        return
      }
      if (event.key !== 'Enter') return
      event.preventDefault()
      if (event.shiftKey) {
        const editor = editorRef.current
        if (editor && insertPlainText(editor, '\n')) {
          emitChange()
          detectMenu()
        }
        return
      }
      if (processingImagesRef.current) {
        onImageError?.('图片仍在处理中，请稍候再发送')
        return
      }
      const payload = getPayload()
      if (payload.promptText || payload.images.length > 0) onSubmit?.(payload)
    }, [detectMenu, emitChange, getPayload, menu, onEscape, onImageError, onSubmit, selectSuggestion, suggestionItems])

    const localStatus = menu?.type === 'skill' && readLocalSkills
      ? skillResult.scan.message ?? (skillResult.scan.status === 'ready' ? undefined : '本地 Skill 暂不可用')
      : undefined
    const listId = 'bookmark-ai-composer-suggestions'

    return (
      <div className={`bookmark-ai-composer-input${disabled ? ' is-disabled' : ''}${className ? ` ${className}` : ''}`}>
        {images.length > 0 ? (
          <div className="bookmark-ai-composer-images" role="list" aria-label="已添加图片">
            {images.map((image) => (
              <div className="bookmark-ai-composer-image" role="listitem" key={image.id}>
                <img src={image.dataUrl} alt="" className="bookmark-ai-composer-image-preview" />
                <span className="bookmark-ai-composer-image-name" title={image.name}>{image.name}</span>
                <button
                  type="button"
                  className="bookmark-ai-composer-image-remove"
                  aria-label={`移除图片 ${image.name}`}
                  disabled={disabled || isProcessingImages}
                  onClick={() => removeImage(image.id)}
                >
                  <span aria-hidden="true">×</span>
                </button>
              </div>
            ))}
          </div>
        ) : null}
        {isEmpty ? <div className="bookmark-ai-composer-placeholder" aria-hidden="true">{placeholder}</div> : null}
        <div
          ref={editorRef}
          className="bookmark-ai-composer-editor"
          role="textbox"
          aria-label={ariaLabel}
          aria-multiline="true"
          aria-disabled={disabled || undefined}
          aria-autocomplete="list"
          aria-controls={menu ? listId : undefined}
          aria-activedescendant={menu && suggestionItems.length > 0 ? `${listId}-option-${menu.activeIndex}` : undefined}
          contentEditable={!disabled}
          suppressContentEditableWarning
          data-bookmark-ai-composer="true"
          onInput={(event) => {
            // composition 期间禁止 emitChange：父级 setState / zustand 会 re-render，
            // 旧 Chromium / uTools 内核上容易打断 IME 组词，把未确认拼音提交成字面量。
            if (composingRef.current || event.nativeEvent.isComposing) return
            emitChange()
            detectMenu()
          }}
          onKeyDown={handleKeyDown}
          onPaste={(event) => {
            if (disabled) return
            const files = Array.from(event.clipboardData.files)
            if (files.some((file) => file.type.startsWith('image/'))) {
              event.preventDefault()
              void addImages(files)
              return
            }
            event.preventDefault()
            if (insertPlainText(event.currentTarget, event.clipboardData.getData('text/plain'))) {
              emitChange()
              detectMenu()
            }
          }}
          onBlur={() => window.setTimeout(() => setMenu(null), 120)}
          onCompositionStart={() => { composingRef.current = true }}
          onCompositionUpdate={() => { composingRef.current = true }}
          onCompositionEnd={() => {
            composingRef.current = false
            emitChange()
            detectMenu()
          }}
        />
        <input
          ref={fileInputRef}
          className="bookmark-ai-composer-file-input"
          type="file"
          hidden
          tabIndex={-1}
          aria-hidden="true"
          accept={BOOKMARK_AI_IMAGE_TYPES.join(',')}
          multiple
          onChange={(event) => {
            const files = Array.from(event.currentTarget.files ?? [])
            event.currentTarget.value = ''
            void addImages(files)
          }}
        />
        <button
          type="button"
          className="bookmark-ai-composer-add-image"
          aria-label="添加图片"
          title="添加图片"
          disabled={disabled || isProcessingImages || images.length >= BOOKMARK_AI_IMAGE_MAX_COUNT}
          onClick={() => fileInputRef.current?.click()}
        >
          <span aria-hidden="true">＋</span>
        </button>
        {isProcessingImages ? (
          <div className="bookmark-ai-composer-image-status" role="status">正在检查图片…</div>
        ) : null}
        {menu ? (
          <SuggestionList
            id={listId}
            items={suggestionItems}
            activeIndex={Math.min(menu.activeIndex, Math.max(0, suggestionItems.length - 1))}
            anchorRect={menu.anchorRect}
            emptyText={menu.type === 'reference' ? '未找到匹配书签或分组' : '未找到匹配 Skill'}
            statusText={localStatus}
            onSelect={selectSuggestion}
          />
        ) : null}
      </div>
    )
  }
)
