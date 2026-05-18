<script setup lang="ts">
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Link from '@tiptap/extension-link'

const props = defineProps<{
  modelValue: string
  placeholder?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const editor = useEditor({
  content: props.modelValue || '<p></p>',
  extensions: [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      codeBlock: false,
    }),
    Link.configure({
      openOnClick: false,
      autolink: true,
    }),
    Placeholder.configure({
      placeholder: props.placeholder || '请输入描述...',
    }),
  ],
  editorProps: {
    attributes: {
      class: 'blocknote-editor-content',
    },
  },
  onUpdate: ({ editor }) => {
    emit('update:modelValue', editor.getHTML())
  },
})

watch(() => props.modelValue, (val) => {
  if (!editor.value) return
  const current = editor.value.getHTML()
  if (current !== val) {
    editor.value.commands.setContent(val || '<p></p>')
  }
})

onBeforeUnmount(() => {
  editor.value?.destroy()
})

const toggleBold = () => editor.value?.chain().focus().toggleBold().run()
const toggleItalic = () => editor.value?.chain().focus().toggleItalic().run()
const toggleStrike = () => editor.value?.chain().focus().toggleStrike().run()
const toggleBulletList = () => editor.value?.chain().focus().toggleBulletList().run()
const toggleOrderedList = () => editor.value?.chain().focus().toggleOrderedList().run()
const toggleHeading = (level: 1 | 2 | 3) => editor.value?.chain().focus().toggleHeading({ level }).run()
const toggleLink = () => {
  if (!editor.value) return
  const previousUrl = editor.value.getAttributes('link').href
  const url = window.prompt('输入链接地址', previousUrl)
  if (url === null) return
  if (url === '') {
    editor.value.chain().focus().extendMarkRange('link').unsetLink().run()
    return
  }
  editor.value.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
}
const isActive = (name: string, attrs?: Record<string, unknown>) => {
  if (!editor.value) return false
  return editor.value.isActive(name, attrs)
}
</script>

<template>
  <div class="blocknote-editor">
    <!-- Toolbar -->
    <div class="blocknote-toolbar">
      <button
        type="button"
        class="blocknote-toolbar-btn"
        :class="{ 'is-active': isActive('bold') }"
        @click="toggleBold"
        title="粗体"
      >
        <span class="i-ph-text-b-thin" />
      </button>
      <button
        type="button"
        class="blocknote-toolbar-btn"
        :class="{ 'is-active': isActive('italic') }"
        @click="toggleItalic"
        title="斜体"
      >
        <span class="i-ph-text-italic-thin" />
      </button>
      <button
        type="button"
        class="blocknote-toolbar-btn"
        :class="{ 'is-active': isActive('strike') }"
        @click="toggleStrike"
        title="删除线"
      >
        <span class="i-ph-text-strikethrough-thin" />
      </button>
      <div class="blocknote-toolbar-divider" />
      <button
        type="button"
        class="blocknote-toolbar-btn"
        :class="{ 'is-active': isActive('heading', { level: 1 }) }"
        @click="toggleHeading(1)"
        title="大标题"
      >
        <span class="i-ph-text-h-one-thin" />
      </button>
      <button
        type="button"
        class="blocknote-toolbar-btn"
        :class="{ 'is-active': isActive('heading', { level: 2 }) }"
        @click="toggleHeading(2)"
        title="小标题"
      >
        <span class="i-ph-text-h-two-thin" />
      </button>
      <div class="blocknote-toolbar-divider" />
      <button
        type="button"
        class="blocknote-toolbar-btn"
        :class="{ 'is-active': isActive('bulletList') }"
        @click="toggleBulletList"
        title="无序列表"
      >
        <span class="i-ph-list-bullets-thin" />
      </button>
      <button
        type="button"
        class="blocknote-toolbar-btn"
        :class="{ 'is-active': isActive('orderedList') }"
        @click="toggleOrderedList"
        title="有序列表"
      >
        <span class="i-ph-list-numbers-thin" />
      </button>
      <div class="blocknote-toolbar-divider" />
      <button
        type="button"
        class="blocknote-toolbar-btn"
        :class="{ 'is-active': isActive('link') }"
        @click="toggleLink"
        title="链接"
      >
        <span class="i-ph-link-thin" />
      </button>
    </div>

    <!-- Editor -->
    <EditorContent :editor="editor" class="blocknote-editor-area" />
  </div>
</template>

<style>
.blocknote-editor {
  border: 1px solid hsl(var(--border) / 0.72);
  border-radius: 1rem;
  background: hsl(var(--background) / 0.72);
  overflow: hidden;
}

.blocknote-toolbar {
  display: flex;
  align-items: center;
  gap: 1px;
  padding: 6px 8px;
  border-bottom: 1px solid hsl(var(--border) / 0.4);
  background: hsl(var(--muted) / 0.3);
  flex-wrap: wrap;
}

.blocknote-toolbar-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: hsl(var(--muted-foreground));
  cursor: pointer;
  transition: all 0.12s ease;
  font-size: 14px;
}

.blocknote-toolbar-btn:hover {
  background: hsl(var(--muted) / 0.8);
  color: hsl(var(--foreground));
}

.blocknote-toolbar-btn.is-active {
  background: hsl(var(--primary) / 0.12);
  color: hsl(var(--primary));
}

.blocknote-toolbar-divider {
  width: 1px;
  height: 18px;
  background: hsl(var(--border) / 0.5);
  margin: 0 4px;
}

.blocknote-editor-area {
  padding: 12px 16px;
  min-height: 120px;
  max-height: 300px;
  overflow-y: auto;
}

.blocknote-editor-area .ProseMirror {
  outline: none;
  font-size: 0.875rem;
  line-height: 1.6;
  color: hsl(var(--foreground));
}

.blocknote-editor-area .ProseMirror p.is-editor-empty:first-child::before {
  content: attr(data-placeholder);
  float: left;
  color: hsl(var(--muted-foreground) / 0.5);
  pointer-events: none;
  height: 0;
}

.blocknote-editor-area .ProseMirror p {
  margin: 0.35em 0;
}

.blocknote-editor-area .ProseMirror h1 {
  font-size: 1.25rem;
  font-weight: 700;
  margin: 0.5em 0 0.3em;
  line-height: 1.3;
}

.blocknote-editor-area .ProseMirror h2 {
  font-size: 1.1rem;
  font-weight: 600;
  margin: 0.5em 0 0.3em;
  line-height: 1.3;
}

.blocknote-editor-area .ProseMirror h3 {
  font-size: 1rem;
  font-weight: 600;
  margin: 0.5em 0 0.3em;
  line-height: 1.3;
}

.blocknote-editor-area .ProseMirror ul,
.blocknote-editor-area .ProseMirror ol {
  margin: 0.35em 0;
  padding-left: 1.5em;
}

.blocknote-editor-area .ProseMirror li {
  margin: 0.15em 0;
}

.blocknote-editor-area .ProseMirror ul li {
  list-style-type: disc;
}

.blocknote-editor-area .ProseMirror ol li {
  list-style-type: decimal;
}

.blocknote-editor-area .ProseMirror a {
  color: hsl(var(--primary));
  text-decoration: underline;
  text-underline-offset: 2px;
}

.blocknote-editor-area .ProseMirror strong {
  font-weight: 600;
}

.blocknote-editor-area .ProseMirror em {
  font-style: italic;
}

.blocknote-editor-area .ProseMirror s,
.blocknote-editor-area .ProseMirror del {
  text-decoration: line-through;
}

.blocknote-editor-area .ProseMirror blockquote {
  border-left: 3px solid hsl(var(--border));
  padding-left: 1em;
  margin: 0.5em 0;
  color: hsl(var(--muted-foreground));
}

.blocknote-editor-area .ProseMirror code {
  background: hsl(var(--muted));
  padding: 0.15em 0.4em;
  border-radius: 4px;
  font-size: 0.85em;
  font-family: ui-monospace, monospace;
}
</style>
