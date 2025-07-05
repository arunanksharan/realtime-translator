import { create } from 'zustand'
import type { 
  TranslationSession, 
  SessionMetrics, 
  PipelineStatus, 
  Translation,
  ConnectionState,
  DailyCallState
} from '@/types'

interface SessionState {
  // Current session
  currentSession: TranslationSession | null
  sessionMetrics: SessionMetrics | null
  pipelineStatus: PipelineStatus | null
  translations: Translation[]
  
  // Connection states
  websocketConnection: ConnectionState
  dailyConnection: DailyCallState
  
  // UI state
  isTranslating: boolean
  showSettings: boolean
  showMetrics: boolean
  
  // Actions
  setCurrentSession: (session: TranslationSession | null) => void
  updateSessionStatus: (status: TranslationSession['status']) => void
  setSessionMetrics: (metrics: SessionMetrics) => void
  setPipelineStatus: (status: PipelineStatus) => void
  addTranslation: (translation: Translation) => void
  clearTranslations: () => void
  
  // Connection actions
  setWebsocketConnection: (state: Partial<ConnectionState>) => void
  setDailyConnection: (state: Partial<DailyCallState>) => void
  
  // UI actions
  setTranslating: (translating: boolean) => void
  setShowSettings: (show: boolean) => void
  setShowMetrics: (show: boolean) => void
  
  // Reset
  resetSession: () => void
}

const initialConnectionState: ConnectionState = {
  status: 'disconnected',
  retryCount: 0,
}

const initialDailyState: DailyCallState = {
  callState: 'idle',
  participants: {},
  localAudio: false,
  localVideo: false,
  networkQuality: 'unknown',
}

export const useSessionStore = create<SessionState>((set, get) => ({
  // Current session
  currentSession: null,
  sessionMetrics: null,
  pipelineStatus: null,
  translations: [],
  
  // Connection states
  websocketConnection: initialConnectionState,
  dailyConnection: initialDailyState,
  
  // UI state
  isTranslating: false,
  showSettings: false,
  showMetrics: false,
  
  // Actions
  setCurrentSession: (session: TranslationSession | null) => {
    set({ currentSession: session })
  },

  updateSessionStatus: (status: TranslationSession['status']) => {
    const currentSession = get().currentSession
    if (currentSession) {
      set({
        currentSession: { ...currentSession, status }
      })
    }
  },

  setSessionMetrics: (metrics: SessionMetrics) => {
    set({ sessionMetrics: metrics })
  },

  setPipelineStatus: (status: PipelineStatus) => {
    set({ pipelineStatus: status })
  },

  addTranslation: (translation: Translation) => {
    set((state) => ({
      translations: [translation, ...state.translations].slice(0, 100) // Keep last 100
    }))
  },

  clearTranslations: () => {
    set({ translations: [] })
  },

  // Connection actions
  setWebsocketConnection: (state: Partial<ConnectionState>) => {
    set((currentState) => ({
      websocketConnection: { ...currentState.websocketConnection, ...state }
    }))
  },

  setDailyConnection: (state: Partial<DailyCallState>) => {
    set((currentState) => ({
      dailyConnection: { ...currentState.dailyConnection, ...state }
    }))
  },

  // UI actions
  setTranslating: (translating: boolean) => {
    set({ isTranslating: translating })
  },

  setShowSettings: (show: boolean) => {
    set({ showSettings: show })
  },

  setShowMetrics: (show: boolean) => {
    set({ showMetrics: show })
  },

  // Reset
  resetSession: () => {
    set({
      currentSession: null,
      sessionMetrics: null,
      pipelineStatus: null,
      translations: [],
      websocketConnection: initialConnectionState,
      dailyConnection: initialDailyState,
      isTranslating: false,
      showSettings: false,
      showMetrics: false,
    })
  },
}))