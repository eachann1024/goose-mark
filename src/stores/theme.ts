

export type ThemeType = 'default' | 'coffee'

export const useThemeStore = defineStore('theme', {
  state: () => ({
    currentTheme: 'default' as ThemeType
  }),
  actions: {
    setTheme(theme: ThemeType) {
      this.currentTheme = theme
    }
  },
  persist: { storage: utoolsStorage }
})
