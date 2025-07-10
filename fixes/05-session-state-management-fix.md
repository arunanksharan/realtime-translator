# Issue 5 Fix: Session State Management and Synchronization

## Problem
1. Session state not properly synchronized between backend and frontend
2. WebSocket updates not always reflecting in UI
3. Missing automatic session status refresh
4. State inconsistencies when multiple users join/leave
5. Pipeline status not properly integrated

## Analysis
The state management infrastructure exists but lacks:
- Proper synchronization mechanisms
- Automatic polling for session updates
- Consistent state update patterns
- Error recovery for state inconsistencies

## Solution Implementation

### 1. Enhanced Session Synchronization
Add session polling and WebSocket synchronization:

```typescript
// In use-sessions.ts - Add session polling hook
export function useSessionPolling(sessionId: string | null, enabled: boolean = true) {
  const queryClient = useQueryClient()
  const { updateSessionStatus } = useSessionStore()
  
  // Poll session status every 5 seconds when active
  const { data: sessionStatus } = useQuery({
    queryKey: ['session-status', sessionId],
    queryFn: () => sessionsApi.get(sessionId!),
    enabled: !!sessionId && enabled,
    refetchInterval: (query) => {
      const status = query.state.data?.status
      // Poll more frequently for active sessions
      if (status === 'active' || status === 'waiting') return 5000
      if (status === 'created') return 10000
      return false // Stop polling for completed/failed
    },
    onSuccess: (data) => {
      // Update local state
      updateSessionStatus(data.status)
      
      // Update session cache
      queryClient.setQueryData(['session', sessionId], data)
    }
  })
  
  return sessionStatus
}
```

### 2. WebSocket State Integration
Enhance WebSocket message handling to update Zustand store:

```typescript
// In use-websocket.ts - Update message handler
ws.onmessage = (event) => {
  try {
    const message: WebSocketMessage = JSON.parse(event.data)
    
    switch (message.type) {
      case 'session_status':
        // Update both local state and React Query cache
        if (message.data?.status) {
          updateSessionStatus(message.data.status)
          queryClient.setQueryData(['session', sessionId], message.data)
        }
        
        // Update pipeline status if included
        if (message.data?.pipeline_status) {
          setPipelineStatus(message.data.pipeline_status)
        }
        break
        
      case 'pipeline_status':
        setPipelineStatus(message.data)
        break
        
      case 'session_metrics':
        setSessionMetrics(message.data)
        break
        
      case 'transcription':
        // Add to transcriptions array
        setTranscriptions(prev => [...prev, message.data])
        
        // Also add to translation history in store
        addTranslation({
          id: `${Date.now()}-${Math.random()}`,
          ...message.data
        })
        break
        
      case 'participant_joined':
      case 'participant_left':
        // Trigger session refresh
        queryClient.invalidateQueries(['session', sessionId])
        break
    }
  } catch (error) {
    console.error('WebSocket message handling error:', error)
  }
}
```

### 3. State Consistency Manager
Add a state consistency checker:

```typescript
// In session store - Add consistency checker
export const useSessionStore = create<SessionState>((set, get) => ({
  // ... existing state ...
  
  // Consistency checker
  ensureConsistency: () => {
    const state = get()
    const { currentSession, websocketConnection, dailyConnection } = state
    
    if (!currentSession) return
    
    // Check for inconsistencies
    const inconsistencies: string[] = []
    
    // Session should be active if translation is running
    if (state.isTranslating && currentSession.status !== 'active') {
      inconsistencies.push('Translation running but session not active')
    }
    
    // Both connections needed for active session
    if (currentSession.status === 'active') {
      if (websocketConnection.status !== 'connected') {
        inconsistencies.push('Active session but WebSocket disconnected')
      }
      if (dailyConnection.callState !== 'joined') {
        inconsistencies.push('Active session but Daily.co not joined')
      }
    }
    
    // Handle inconsistencies
    if (inconsistencies.length > 0) {
      console.warn('State inconsistencies detected:', inconsistencies)
      
      // Auto-fix some issues
      if (state.isTranslating && currentSession.status !== 'active') {
        set({ isTranslating: false })
      }
    }
    
    return inconsistencies
  },
}))

// Run consistency checks periodically
useEffect(() => {
  const interval = setInterval(() => {
    ensureConsistency()
  }, 2000)
  
  return () => clearInterval(interval)
}, [])
```

### 4. Optimistic Updates with Rollback
Implement optimistic updates for better UX:

```typescript
// In use-sessions.ts
export function useOptimisticSessionUpdate() {
  const queryClient = useQueryClient()
  const { currentSession, setCurrentSession } = useSessionStore()
  
  const updateSession = useCallback(async (
    updates: Partial<TranslationSession>,
    apiCall: () => Promise<TranslationSession>
  ) => {
    if (!currentSession) return
    
    // Save current state for rollback
    const previousSession = { ...currentSession }
    
    // Optimistic update
    const optimisticSession = { ...currentSession, ...updates }
    setCurrentSession(optimisticSession)
    queryClient.setQueryData(['session', currentSession.session_id], optimisticSession)
    
    try {
      // Make API call
      const updatedSession = await apiCall()
      
      // Update with server response
      setCurrentSession(updatedSession)
      queryClient.setQueryData(['session', currentSession.session_id], updatedSession)
      
    } catch (error) {
      // Rollback on error
      setCurrentSession(previousSession)
      queryClient.setQueryData(['session', currentSession.session_id], previousSession)
      throw error
    }
  }, [currentSession, setCurrentSession, queryClient])
  
  return { updateSession }
}
```

### 5. Session Event Bus
Create an event bus for session-related events:

```typescript
// Create event bus for session events
class SessionEventBus extends EventTarget {
  emit(event: string, data?: any) {
    this.dispatchEvent(new CustomEvent(event, { detail: data }))
  }
}

export const sessionEventBus = new SessionEventBus()

// Use in components
useEffect(() => {
  const handleSessionUpdate = (event: CustomEvent) => {
    console.log('Session updated:', event.detail)
    // Handle update
  }
  
  sessionEventBus.addEventListener('session:updated', handleSessionUpdate)
  
  return () => {
    sessionEventBus.removeEventListener('session:updated', handleSessionUpdate)
  }
}, [])
```

## Implementation Summary

### State Flow
```
User Action / WebSocket Message
    ↓
Zustand Store Update (Immediate)
    ↓
React Query Cache Update (Consistency)
    ↓
UI Re-render
    ↓
Consistency Check (Background)
    ↓
Auto-fix if needed
```

### Key Improvements
- ✅ Automatic session polling for active sessions
- ✅ WebSocket → Store → Query Cache synchronization
- ✅ State consistency checking
- ✅ Optimistic updates with rollback
- ✅ Event bus for decoupled updates

### Files to Update
1. `/frontend/src/hooks/use-sessions.ts` - Add polling hook
2. `/frontend/src/hooks/use-websocket.ts` - Enhanced message handling
3. `/frontend/src/stores/session.ts` - Add consistency checker
4. `/frontend/src/app/session/[sessionId]/page.tsx` - Use polling hook

## Next Steps
1. Implement session polling hook
2. Enhance WebSocket message handlers
3. Add consistency checking
4. Test multi-user scenarios
5. Add state debugging tools
