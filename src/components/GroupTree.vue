<script setup lang="ts">


const store = useBookmarkStore()

const handleGroupClick = (groupId: string) => {
  store.selectGroup(groupId)
}

const handleSubClick = (groupId: string, subId: string) => {
  store.selectGroup(groupId, subId)
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <div v-for="group in store.groups" :key="group.id" class="space-y-2">
      <Button
        variant="ghost"
        class="flex items-center justify-between w-full px-3 py-2 rounded-2xl text-left hover:bg-secondary/70 transition-colors"
        :class="group.id === store.activeGroupId ? 'bg-secondary font-semibold' : 'bg-transparent'"
        @click="handleGroupClick(group.id)"
      >
        <span class="truncate">{{ group.name }}</span>
        <span class="i-mdi-chevron-right text-muted" />
      </Button>
      <div class="pl-4 flex flex-col gap-1">
        <Button
          v-for="sub in group.children"
          :key="sub.id"
          variant="ghost"
          class="flex items-center gap-2 px-3 py-2 rounded-xl text-sm justify-start hover:bg-secondary/60"
          :class="sub.id === store.activeSubGroupId ? 'bg-secondary text-accent-foreground' : 'bg-transparent'"
          @click="handleSubClick(group.id, sub.id)"
        >
          <span class="i-mdi-circle-medium text-xs" />
          <span class="truncate">{{ sub.name }}</span>
        </Button>
      </div>
    </div>
  </div>
</template>
