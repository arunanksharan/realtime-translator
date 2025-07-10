# Implementation Guide: Session State Synchronization

## Overview
This guide provides step-by-step implementation for proper session state synchronization between frontend and backend, ensuring consistent state across all components.

## Implementation Steps

### 1. Create Session Polling Hook

**File**: `/frontend/src/hooks/use-sessions.ts`

**Add this new hook**:

```typescript
export function useSessionPolling(
  sessionId: string | null, 
  enabled: boolean = true
) {
  const queryClient = useQueryClient()
  const { 
    updateSessionStatus, 
    setPipelineStatus,
    setSessionMetrics 
  } = useSessionStore()
  
  // Poll session status
  const { data: session, isLoading } = useQuery({
    queryKey: ['session-poll', sessionId],
    queryFn: async () => {
      if (!sessionId) return null
      
      // Fetch session with pipeline status
      const sessionData = await sessionsApi.get(sessionId)
      
      // Also fetch metrics if session is active
      if (sessionData.status === 'active') {
        try {
          const metrics = await sessionsApi.getMetrics(sessionId)
          setSessionMetrics(metrics)
        } catch (error) {
          console.warn('Failed to fetch metrics:', error)
        }
      }
      
      return sessionData
    },
    enabled: !!sessionId && enabled,
    staleTime: 2000, // Consider data stale after 2s
    refetchInterval: (query) => {
      if (!query.state.data) return false
      
      const status = query.state.data.status
      // Poll more frequently for active sessions
      switch (status) {
        case 'active':
        case 'starting':
          return 3000 // 3 seconds
        case 'waiting':
        case 'created':
          return 5000 // 5 seconds
        default:
          return false // Stop polling
      }
    },
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    onSuccess: (data) => {
      if (!data) return
      
      // Update Zustand store
      updateSessionStatus(data.status)
      
      if (data.pipeline_status) {
        setPipelineStatus(data.pipeline_status)
      }
      
      // Update React Query cache
      queryClient.setQueryData(['session', sessionId], data)
      
      // Emit event for other components
      window.dispatchEvent(
        new CustomEvent('session:updated', { detail: data })
      )
    },
    onError: (error) => {
      console.error('Session polling error:', error)
      // Could trigger reconnection logic here
    }
  })
  
  return { session, isLoading }
}
```

### 2. Update Session Page to Use Polling

**File**: `/frontend/src/app/session/[sessionId]/page.tsx`

**Add polling integration**:

```typescript
export default function SessionPage() {
  // ... existing code ...
  
  // Add session polling
  const { session: polledSession } = useSessionPolling(
    sessionId,
    isAuthenticated // Only poll if authenticated
  )
  
  // Merge polled data with existing session data
  useEffect(() => {
    if (polledSession && (!session || 
        polledSession.updated_at > session.updated_at)) {
      setCurrentSession(polledSession)
    }
  }, [polledSession, session, setCurrentSession])
  
  // ... rest of component ...
}
```

### 3. Enhanced WebSocket Message Handling

**File**: `/frontend/src/hooks/use-websocket.ts`

**Update the message handler**:

```typescript
ws.onmessage = (event) => {
  console.log('📨 useWebSocket: Received message:', event.data)
  
  if (event.data === 'pong') {
    console.log('🏓 useWebSocket: Pong received')
    return
  }

  try {
    const message: WebSocketMessage = JSON.parse(event.data)
    console.log('📋 useWebSocket: Parsed message:', message.type, message.data)
    
    // Import store actions
    const { 
      updateSessionStatus, 
      setPipelineStatus, 
      setSessionMetrics,
      addTranslation 
    } = useSessionStore.getState()
    
    switch (message.type) {
      case 'session_status':
        if (message.data) {
          // Update session status
          if (message.data.status) {
            updateSessionStatus(message.data.status)
            setSessionStatus(message.data.status)
          }
          
          // Update pipeline status if included
          if (message.data.pipeline_status) {
            setPipelineStatus(message.data.pipeline_status)
          }
          
          // Update React Query cache
          queryClient.setQueryData(
            ['session', sessionId], 
            (old: any) => ({ ...old, ...message.data })
          )
          
          // Show status message if included
          if (message.data.message) {
            toast.info(message.data.message)
          }
        }
        break
        
      case 'session_metrics':
        if (message.data) {
          setSessionMetrics(message.data)
        }
        break

      case 'transcription':
        if (message.data) {
          // Add to local transcriptions array
          setTranscriptions(prev => [...prev, message.data as TranscriptionData])
          
          // Also add to store for persistence
          const translation: Translation = {
            id: `${Date.now()}-${Math.random()}`,
            session_id: message.data.session_id,
            from_user_id: message.data.speaker_id,
            to_user_id: 'unknown', // Would need to determine this
            original_text: message.data.original_text,
            translated_text: message.data.translated_text,
            original_language: message.data.language_from,
            translated_language: message.data.language_to,
            confidence_score: Math.round(message.data.confidence * 100),
            created_at: message.data.timestamp
          }
          
          addTranslation(translation)
        }
        break

      case 'participant_joined':
        if (message.data?.user_id) {
          setParticipants(prev => [...prev, message.data.user_id])
          toast.success(`User joined the session`)
          
          // Trigger session refresh
          queryClient.invalidateQueries(['session', sessionId])
        }
        break

      case 'participant_left':
        if (message.data?.user_id) {
          setParticipants(prev => prev.filter(id => id !== message.data.user_id))
          toast.info(`User left the session`)
          
          // Trigger session refresh
          queryClient.invalidateQueries(['session', sessionId])
        }
        break

      case 'participants':
        if (message.data && Array.isArray(message.data)) {
          setParticipants(message.data.map(p => p.user_id || p))
        }
        break
        
      case 'pipeline_status':
        if (message.data) {
          setPipelineStatus(message.data)
        }
        break
        
      case 'error':
        console.error('💥 useWebSocket: Server error:', message.error || message.data?.error_message)
        const errorMsg = message.data?.error_message || message.error || 'Unknown error'
        toast.error(errorMsg)
        
        // Handle specific error types
        if (errorMsg.includes('session_not_found')) {
          // Navigate back to dashboard
          router.push('/dashboard')
        }
        break

      default:
        console.log('❓ useWebSocket: Unknown message type:', message.type)
    }
  } catch (error) {
    console.error('💥 useWebSocket: Failed to parse message:', error)
  }
}
```

### 4. Add State Consistency Checker

**File**: `/frontend/src/stores/session.ts`

**Add to the store**:

```typescript
interface SessionState {
  // ... existing state ...
  
  // Add consistency check
  lastConsistencyCheck: Date | null
  
  // Actions
  checkConsistency: () => string[]
  syncWithBackend: (sessionId: string) => Promise<void>
}

export const useSessionStore = create<SessionState>((set, get) => ({
  // ... existing state ...
  
  lastConsistencyCheck: null,
  
  checkConsistency: () => {
    const state = get()
    const issues: string[] = []
    
    // Check 1: Session status vs translation state
    if (state.isTranslating && state.currentSession?.status !== 'active') {
      issues.push('Translation active but session not active')
      // Auto-fix
      set({ isTranslating: false })
    }
    
    // Check 2: Connection requirements for active session
    if (state.currentSession?.status === 'active') {
      if (state.websocketConnection.status !== 'connected') {
        issues.push('Active session requires WebSocket connection')
      }
      if (state.dailyConnection.callState !== 'joined') {
        issues.push('Active session requires Daily.co connection')
      }
    }
    
    // Check 3: User B required for active session
    if (state.currentSession?.status === 'active' && !state.currentSession.user_b_id) {
      issues.push('Active session missing User B')
      // Auto-fix
      set((s) => ({
        currentSession: s.currentSession ? 
          { ...s.currentSession, status: 'waiting' } : null
      }))
    }
    
    // Check 4: Pipeline status sync
    if (state.pipelineStatus && state.currentSession) {
      if (state.pipelineStatus.session_id !== state.currentSession.session_id) {
        issues.push('Pipeline status for wrong session')
        // Clear mismatched pipeline status
        set({ pipelineStatus: null })
      }
    }
    
    // Update last check time
    set({ lastConsistencyCheck: new Date() })
    
    if (issues.length > 0) {
      console.warn('State consistency issues:', issues)
    }
    
    return issues
  },
  
  syncWithBackend: async (sessionId: string) => {
    try {
      // Fetch latest session data
      const session = await sessionsApi.get(sessionId)
      
      // Update local state
      set({ currentSession: session })
      
      // Fetch metrics if active
      if (session.status === 'active') {
        try {
          const metrics = await sessionsApi.getMetrics(sessionId)
          set({ sessionMetrics: metrics })
        } catch (error) {
          console.warn('Failed to fetch metrics:', error)
        }
      }
      
      // Check consistency after sync
      get().checkConsistency()
      
    } catch (error) {
      console.error('Failed to sync with backend:', error)
      throw error
    }
  }
}))
```

### 5. Create Consistency Monitor Hook

**File**: `/frontend/src/hooks/use-consistency-monitor.ts`

```typescript
import { useEffect, useRef } from 'react'
import { useSessionStore } from '@/stores/session'

export function useConsistencyMonitor(enabled: boolean = true) {
  const { checkConsistency, currentSession } = useSessionStore()
  const intervalRef = useRef<NodeJS.Timeout>()
  
  useEffect(() => {
    if (!enabled || !currentSession) return
    
    // Run initial check
    checkConsistency()
    
    // Set up periodic checks
    intervalRef.current = setInterval(() => {
      const issues = checkConsistency()
      
      // Log issues in development
      if (process.env.NODE_ENV === 'development' && issues.length > 0) {
        console.log('🔍 Consistency check found issues:', issues)
      }
    }, 5000) // Check every 5 seconds
    
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [enabled, currentSession, checkConsistency])
}

// Use in session page
export default function SessionPage() {
  // ... existing code ...
  
  // Monitor consistency
  useConsistencyMonitor(!!session)
  
  // ... rest of component ...
}
```

### 6. Add Optimistic Updates

**File**: `/frontend/src/hooks/use-optimistic-updates.ts`

```typescript
import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useSessionStore } from '@/stores/session'
import { toast } from 'sonner'

export function useOptimisticUpdate() {
  const queryClient = useQueryClient()
  const { currentSession, setCurrentSession } = useSessionStore()
  
  const optimisticUpdate = useCallback(async <T extends any>(
    config: {
      updateFn: () => Promise<T>
      optimisticData: Partial<TranslationSession>
      successMessage?: string
      errorMessage?: string
      rollbackOnError?: boolean
    }
  ) => {
    if (!currentSession) {
      throw new Error('No current session')
    }
    
    // Save current state
    const previousSession = { ...currentSession }
    const previousCache = queryClient.getQueryData(['session', currentSession.session_id])
    
    try {
      // Apply optimistic update
      const optimisticSession = { ...currentSession, ...config.optimisticData }
      setCurrentSession(optimisticSession)
      queryClient.setQueryData(['session', currentSession.session_id], optimisticSession)
      
      // Execute actual update
      const result = await config.updateFn()
      
      // Show success message
      if (config.successMessage) {
        toast.success(config.successMessage)
      }
      
      return result
      
    } catch (error) {
      // Rollback if configured
      if (config.rollbackOnError !== false) {
        setCurrentSession(previousSession)
        queryClient.setQueryData(['session', currentSession.session_id], previousCache)
      }
      
      // Show error message
      const message = config.errorMessage || 'Update failed'
      toast.error(message)
      
      throw error
    }
  }, [currentSession, setCurrentSession, queryClient])
  
  return { optimisticUpdate }
}

// Usage example
const { optimisticUpdate } = useOptimisticUpdate()

const handleStartTranslation = () => {
  optimisticUpdate({
    updateFn: () => startSessionMutation.mutateAsync(session.session_id),
    optimisticData: { status: 'active' },
    successMessage: 'Translation started',
    errorMessage: 'Failed to start translation'
  })
}
```

### 7. Testing State Synchronization

Create a test component to verify synchronization:

```typescript
// /frontend/src/components/StateDebugger.tsx
export function StateDebugger() {
  const session = useSessionStore()
  const { data: querySession } = useQuery(['session', session.currentSession?.session_id])
  
  if (process.env.NODE_ENV !== 'development') return null
  
  return (
    <div className="fixed bottom-4 right-4 bg-black/80 text-white p-4 rounded-lg text-xs max-w-md">
      <h3 className="font-bold mb-2">State Debugger</h3>
      
      <div className="space-y-2">
        <div>
          <strong>Session Status:</strong> {session.currentSession?.status || 'none'}
        </div>
        <div>
          <strong>WebSocket:</strong> {session.websocketConnection.status}
        </div>
        <div>
          <strong>Daily.co:</strong> {session.dailyConnection.callState}
        </div>
        <div>
          <strong>Translating:</strong> {session.isTranslating ? 'Yes' : 'No'}
        </div>
        <div>
          <strong>Cache Sync:</strong> {
            JSON.stringify(querySession?.status) === 
            JSON.stringify(session.currentSession?.status) ? '✅' : '❌'
          }
        </div>
      </div>
      
      <button
        onClick={() => session.checkConsistency()}
        className="mt-2 px-2 py-1 bg-blue-500 rounded text-xs"
      >
        Check Consistency
      </button>
    </div>
  )
}
```

## Verification Checklist

- [ ] Session status updates immediately on WebSocket messages
- [ ] Polling works for active sessions
- [ ] State remains consistent across page refreshes
- [ ] Optimistic updates provide instant feedback
- [ ] Rollback works on errors
- [ ] No duplicate API calls
- [ ] Consistency checker fixes issues automatically
- [ ] React Query cache stays in sync with Zustand

## Next Steps

1. Implement all components
2. Add the StateDebugger in development
3. Test multi-user scenarios
4. Monitor performance impact
5. Add telemetry for state sync issues
