<script setup lang="ts">
import type { SubGroup } from '@/types/bookmark'

const props = defineProps<{
  show: boolean
  currentSubGroup?: SubGroup
}>()

const emit = defineEmits<{
  openShareUrl: [shareId: string]
  copyShareLink: [shareId: string]
  manageShare: []
  deleteSubGroup: []
  // 接收者专用事件
  checkUpdate: []
  convertToLocal: []
  removeImportedSubGroup: []
}>()

const showSubShareMenu = ref(false)
const showImportedMenu = ref(false)

const isSubShared = computed(() => !!props.currentSubGroup?.shareId)
const isSubImported = computed(() => !!props.currentSubGroup?.sourceShareId)
const currentSubShareId = computed(() => props.currentSubGroup?.shareId)
const sourceShareId = computed(() => props.currentSubGroup?.sourceShareId)

const handleOpenShareUrl = () => {
  if (currentSubShareId.value) {
    emit('openShareUrl', currentSubShareId.value)
    showSubShareMenu.value = false
  }
}

const handleCopyShareLink = () => {
  if (currentSubShareId.value) {
    emit('copyShareLink', currentSubShareId.value)
    showSubShareMenu.value = false
  }
}

const handleManageShare = () => {
  emit('manageShare')
  showSubShareMenu.value = false
}

const handleDeleteSubGroup = () => {
  emit('deleteSubGroup')
  showSubShareMenu.value = false
}

// 接收者专用操作
const handleCopyImportedLink = () => {
  if (sourceShareId.value) {
    emit('copyShareLink', sourceShareId.value)
    showImportedMenu.value = false
  }
}

const handleCheckUpdate = () => {
  emit('checkUpdate')
  showImportedMenu.value = false
}

const handleConvertToLocal = () => {
  emit('convertToLocal')
  showImportedMenu.value = false
}

const handleRemoveImported = () => {
  emit('removeImportedSubGroup')
  showImportedMenu.value = false
}
</script>

<template>
  <!-- 接收者分组的管理按钮 -->
  <div v-if="show && isSubImported" class="fixed bottom-6 left-6 z-40">
    <Popover v-model:open="showImportedMenu">
      <PopoverTrigger as-child>
        <Button
          variant="outline"
          size="sm"
          class="h-8 px-3 rounded-full relative gap-1.5 shadow-lg backdrop-blur-sm bg-card/90 border-dashed border-green-500/50 text-green-600"
        >
          <span class="i-mdi-cloud-download-outline text-sm" />
          <span class="text-xs">导入</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent class="w-40 p-1" align="start" :side-offset="4">
        <div class="flex flex-col">
          <Button
            variant="ghost"
            size="sm"
            class="justify-start h-8 text-xs gap-2"
            @click="handleCopyImportedLink"
          >
            <span class="i-mdi-content-copy text-sm" />
            复制分享链接
          </Button>
          <Button
            variant="ghost"
            size="sm"
            class="justify-start h-8 text-xs gap-2"
            @click="handleCheckUpdate"
          >
            <span class="i-mdi-refresh text-sm" />
            检查更新
          </Button>
          <div class="h-px bg-border my-1" />
          <Button
            variant="ghost"
            size="sm"
            class="justify-start h-8 text-xs gap-2"
            @click="handleConvertToLocal"
          >
            <span class="i-mdi-link-off text-sm" />
            转为本地
          </Button>
          <Button
            variant="ghost"
            size="sm"
            class="justify-start h-8 text-xs gap-2 text-destructive hover:text-destructive"
            @click="handleRemoveImported"
          >
            <span class="i-mdi-delete-outline text-sm" />
            移除分组
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  </div>

  <!-- 分享者分组的管理按钮 -->
  <div v-else-if="show && !isSubImported" class="fixed bottom-6 left-6 z-40">
    <Popover v-if="isSubShared" v-model:open="showSubShareMenu">
      <PopoverTrigger as-child>
        <Button
          variant="outline"
          size="sm"
          class="h-8 px-3 rounded-full relative gap-1.5 shadow-lg backdrop-blur-sm bg-card/90 border-dashed border-blue-500/50 text-blue-600"
        >
          <span class="i-mdi-share-variant text-sm" />
          <span class="text-xs">分享</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent class="w-40 p-1" align="start" :side-offset="4">
        <div class="flex flex-col">
          <Button
            variant="ghost"
            size="sm"
            class="justify-start h-8 text-xs gap-2"
            @click="handleOpenShareUrl"
          >
            <span class="i-mdi-open-in-new text-sm" />
            打开网址
          </Button>
          <Button
            variant="ghost"
            size="sm"
            class="justify-start h-8 text-xs gap-2"
            @click="handleCopyShareLink"
          >
            <span class="i-mdi-content-copy text-sm" />
            复制链接
          </Button>
          <Button
            variant="ghost"
            size="sm"
            class="justify-start h-8 text-xs gap-2"
            @click="handleManageShare"
          >
            <span class="i-mdi-cog text-sm" />
            管理分享
          </Button>
        </div>
      </PopoverContent>
    </Popover>

    <Tooltip v-else>
      <TooltipTrigger as-child>
        <Button
          variant="outline"
          size="sm"
          class="h-8 px-3 rounded-full text-muted-foreground gap-1.5 shadow-lg backdrop-blur-sm bg-card/90"
          @click="$emit('manageShare')"
        >
          <span class="i-mdi-share-variant text-sm" />
          <span class="text-xs">分享</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>生成在线分享链接</p>
      </TooltipContent>
    </Tooltip>
  </div>
</template>
