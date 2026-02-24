<script setup lang="ts">
import type { FeatureNoticeItem } from '@/composables/useFeatureNoticeCenter'

defineProps<{
  notice: FeatureNoticeItem | null
}>()

const emit = defineEmits<{
  view: []
  ignore: []
}>()
</script>

<template>
  <Teleport to="body">
    <Transition name="feature-notice">
      <div
        v-if="notice"
        class="feature-notice fixed right-4 top-4 z-[21000] w-[340px] max-w-[calc(100vw-2rem)] rounded-xl border bg-card p-4 shadow-xl"
      >
        <button
          type="button"
          class="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/80 hover:text-foreground"
          aria-label="关闭提示"
          @click="emit('ignore')"
        >
          <span class="i-mdi-close text-sm" />
        </button>

        <div class="pr-7">
          <div class="flex items-center gap-2 text-sm font-semibold text-foreground">
            <span class="i-mdi-bell-ring-outline text-base text-primary" />
            <span>{{ notice.title }}</span>
          </div>
          <p class="mt-2 text-xs leading-5 text-muted-foreground">
            {{ notice.description }}
          </p>
        </div>

        <div class="mt-4 flex items-center justify-end gap-2">
          <Button size="sm" variant="ghost" @click="emit('ignore')">
            {{ notice.secondaryLabel }}
          </Button>
          <Button size="sm" @click="emit('view')">
            {{ notice.primaryLabel }}
          </Button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.feature-notice-enter-active,
.feature-notice-leave-active {
  transition: opacity 180ms ease, transform 180ms ease;
}

.feature-notice-enter-from,
.feature-notice-leave-to {
  opacity: 0;
  transform: translateY(-8px) scale(0.96);
}
</style>
