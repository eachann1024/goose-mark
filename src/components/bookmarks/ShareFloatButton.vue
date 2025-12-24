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
  checkUpdate: []
  deleteSubGroup: []
}>()

const showSubShareMenu = ref(false)

const isSubShared = computed(() => !!props.currentSubGroup?.shareId)
const isSubImported = computed(() => !!props.currentSubGroup?.sourceShareId)
const currentSubShareId = computed(() => props.currentSubGroup?.shareId)

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

const handleCheckUpdate = () => {
  emit('checkUpdate')
  showSubShareMenu.value = false
}

const handleDeleteSubGroup = () => {
  emit('deleteSubGroup')
  showSubShareMenu.value = false
}
</script>

<template>
  <div v-if="show" class="fixed bottom-6 left-6 z-40">
    <Popover v-if="isSubShared || isSubImported" v-model:open="showSubShareMenu">
      <PopoverTrigger as-child>
        <Button
          variant="outline"
          size="sm"
          class="h-8 px-3 rounded-full relative gap-1.5 shadow-lg backdrop-blur-sm bg-card/90"
          :class="{
            'border-dashed border-blue-500/50 text-blue-600': isSubShared,
            'border-dashed border-green-500/50 text-green-600': isSubImported
          }"
        >
          <span :class="isSubImported ? 'i-mdi-cog' : 'i-mdi-share-variant'" class="text-sm" />
          <span class="text-xs">{{ isSubImported ? '管理' : '分享' }}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent class="w-40 p-1" align="start" :side-offset="4">
        <div class="flex flex-col">
          <template v-if="isSubShared">
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
          </template>
          <template v-else-if="isSubImported">
            <Button
              variant="ghost"
              size="sm"
              class="justify-start h-8 text-xs gap-2 text-green-600"
              @click="handleCheckUpdate"
            >
              <span class="i-mdi-cloud-sync text-sm" />
              检查更新
            </Button>
            <Button
              variant="ghost"
              size="sm"
              class="justify-start h-8 text-xs gap-2 text-destructive"
              @click="handleDeleteSubGroup"
            >
              <span class="i-mdi-delete-outline text-sm" />
              删除
            </Button>
          </template>
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
