import { create } from 'zustand';

export const useSessionStore = create((set, get) => ({
  // Session state
  session: null,
  isLoading: false,
  error: null,
  
  // Translation state
  translations: [],
  participants: {},
  pipelineStatus: {
    a_to_b: null,
    b_to_a: null,
  },
  
  // Actions
  setSession: (session) => set({ session, error: null }),
  
  setLoading: (isLoading) => set({ isLoading }),
  
  setError: (error) => set({ error }),
  
  addTranslation: (translation) => set((state) => ({
    translations: [...state.translations, {
      ...translation,
      timestamp: new Date().toISOString(),
    }],
  })),
  
  updateParticipant: (participantId, data) => set((state) => ({
    participants: {
      ...state.participants,
      [participantId]: {
        ...state.participants[participantId],
        ...data,
      },
    },
  })),
  
  updatePipelineStatus: (pipeline, status) => set((state) => ({
    pipelineStatus: {
      ...state.pipelineStatus,
      [pipeline]: status,
    },
  })),
  
  // Update from polling
  updateSessionFromPoll: (data) => set((state) => {
    const updates = {};
    
    // Update session status
    if (data.session) {
      updates.session = {
        ...state.session,
        ...data.session,
      };
    }
    
    // Update pipeline status
    if (data.pipeline_status) {
      updates.pipelineStatus = data.pipeline_status;
    }
    
    // Update participants
    if (data.participants) {
      updates.participants = data.participants;
    }
    
    return updates;
  }),
  
  // Clear session
  clearSession: () => set({
    session: null,
    translations: [],
    participants: {},
    pipelineStatus: {
      a_to_b: null,
      b_to_a: null,
    },
    error: null,
  }),
}));
