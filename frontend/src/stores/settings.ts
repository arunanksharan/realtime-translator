import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { STORAGE_KEYS, DEFAULT_AUDIO_SETTINGS, DEFAULT_UI_SETTINGS } from '@/lib/constants'
import type { AudioSettings, UIState } from '@/types'

interface SettingsState {
  audio: AudioSettings
  ui: UIState
  
  // Actions
  updateAudio: (settings: Partial<AudioSettings>) => void
  updateUI: (settings: Partial<UIState>) => void
  resetAudio: () => void
  resetUI: () => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      audio: DEFAULT_AUDIO_SETTINGS,
      ui: DEFAULT_UI_SETTINGS,

      updateAudio: (settings: Partial<AudioSettings>) => {
        set((state) => ({
          audio: { ...state.audio, ...settings }
        }))
      },

      updateUI: (settings: Partial<UIState>) => {
        set((state) => ({
          ui: { ...state.ui, ...settings }
        }))
      },

      resetAudio: () => {
        set({ audio: DEFAULT_AUDIO_SETTINGS })
      },

      resetUI: () => {
        set({ ui: DEFAULT_UI_SETTINGS })
      },
    }),
    {
      name: STORAGE_KEYS.UI_SETTINGS,
    }
  )
)