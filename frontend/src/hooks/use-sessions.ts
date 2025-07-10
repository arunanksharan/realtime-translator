import * as React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { sessionsApi } from '@/lib/api'
import { useSessionStore } from '@/stores/session'
import type { CreateSessionRequest, TranslationSession, SessionTokens, SessionListResponse, SessionMetrics } from '@/types'

export function useCreateSession() {
  const setCurrentSession = useSessionStore((state) => state.setCurrentSession)
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: sessionsApi.create,
    onSuccess: (data) => {
      console.log('✅ Session created successfully:', data)
      console.log('📍 Session ID:', data.session_id)
      console.log('📊 Full session data:', JSON.stringify(data, null, 2))
      
      setCurrentSession(data)
      queryClient.invalidateQueries({ queryKey: ['sessions'] })
      toast.success('Translation session created!')
    },
    onError: (error: any) => {
      console.error('❌ Create session error:', error)
      console.error('📍 Error response:', error.response?.data)
      console.error('📍 Error status:', error.response?.status)
      const message = error.response?.data?.detail || 'Failed to create session'
      toast.error(message)
    },
  })
}

export function useJoinSession() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: sessionsApi.join,
    onSuccess: (_, sessionId) => {
      queryClient.invalidateQueries({ queryKey: ['session', sessionId] })
      queryClient.invalidateQueries({ queryKey: ['sessions'] })
      toast.success('Joined session successfully!')
    },
    onError: (error: any) => {
      const message = error.response?.data?.detail || 'Failed to join session'
      toast.error(message)
    },
  })
}

export function useStartSession() {
  return useMutation({
    mutationFn: sessionsApi.start,
    onSuccess: () => {
      toast.success('Translation started!')
    },
    onError: (error: any) => {
      const message = error.response?.data?.detail || 'Failed to start translation'
      toast.error(message)
    },
  })
}

export function useStopSession() {
  return useMutation({
    mutationFn: sessionsApi.stop,
    onSuccess: () => {
      toast.success('Translation stopped')
    },
    onError: (error: any) => {
      const message = error.response?.data?.detail || 'Failed to stop translation'
      toast.error(message)
    },
  })
}

export function usePublicSession(sessionId: string | null) {
  return useQuery({
    queryKey: ['public-session', sessionId],
    queryFn: () => {
      console.log('🔍 Fetching public session:', sessionId)
      return sessionsApi.getPublic(sessionId!)
    },
    enabled: !!sessionId,
    staleTime: 60000, // 1 minute
    gcTime: 5 * 60 * 1000, // 5 minutes
    retry: (failureCount, error: any) => {
      const statusCode = error?.response?.status
      if (statusCode === 404) return false
      return failureCount < 2
    },
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
    refetchInterval: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    refetchOnMount: true,
  })
}

export function useSession(sessionId: string | null) {
  return useQuery({
    queryKey: ['session', sessionId],
    queryFn: () => {
      console.log('🔍 Fetching session:', sessionId)
      return sessionsApi.get(sessionId!)
    },
    enabled: !!sessionId,
    staleTime: 60000, // 1 minute
    gcTime: 5 * 60 * 1000, // 5 minutes
    retry: (failureCount, error: any) => {
      const statusCode = error?.response?.status
      if (statusCode === 404) return false
      if (statusCode === 401 || statusCode === 403) return false
      return failureCount < 2
    },
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
    refetchInterval: (query) => {
      // Smart refetching for active sessions
      if (query.state.data?.status === 'active') return 30000 // 30 seconds for active
      return false
    },
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    refetchOnMount: true,
  })
}

export function useSessions(limit = 10) {
  return useQuery({
    queryKey: ['sessions', limit],
    queryFn: () => sessionsApi.list(limit),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000,
    retry: false,
    refetchInterval: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
  })
}

export function useSessionTokens(sessionId: string | null) {
  return useQuery({
    queryKey: ['session-tokens', sessionId],
    queryFn: () => {
      console.log('🔍 Fetching session tokens:', sessionId)
      return sessionsApi.getTokens(sessionId!)
    },
    enabled: !!sessionId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000,
    retry: (failureCount, error: any) => {
      const statusCode = error?.response?.status
      if (statusCode === 404) return false
      if (statusCode === 401 || statusCode === 403) return false
      return failureCount < 1
    },
    retryDelay: (attemptIndex) => Math.min(2000 * 2 ** attemptIndex, 10000),
    refetchInterval: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: true,
  })
}

export function useSessionMetrics(sessionId: string | null) {
  const setSessionMetrics = useSessionStore((state) => state.setSessionMetrics)

  const query = useQuery({
    queryKey: ['session-metrics', sessionId],
    queryFn: () => sessionsApi.getMetrics(sessionId!),
    enabled: !!sessionId,
    staleTime: 30000, // 30 seconds
    gcTime: 5 * 60 * 1000,
    retry: (failureCount, error: any) => {
      const statusCode = error?.response?.status
      if (statusCode === 404) return false
      if (statusCode === 401 || statusCode === 403) return false
      return failureCount < 1
    },
    retryDelay: (attemptIndex) => Math.min(2000 * 2 ** attemptIndex, 10000),
    refetchInterval: (query) => {
      // Only refetch metrics for active sessions
      const sessionStatus = query.state.data?.session_status
      if (sessionStatus === 'active') return 30000 // 30 seconds
      return false
    },
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: true,
  })

  // Use useEffect to handle side effects when data changes
  React.useEffect(() => {
    if (query.data) {
      setSessionMetrics(query.data)
    }
  }, [query.data, setSessionMetrics])

  return query
}

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

export function useGenerateInviteCode() {
  return useMutation({
    mutationFn: sessionsApi.generateInviteCode,
    onSuccess: () => {
      toast.success('Invite code generated!')
    },
    onError: (error: any) => {
      const message = error.response?.data?.detail || 'Failed to generate invite code'
      toast.error(message)
    },
  })
}

export function useGenerateShareLink() {
  return useMutation({
    mutationFn: sessionsApi.generateShareLink,
    onSuccess: () => {
      toast.success('Share link generated!')
    },
    onError: (error: any) => {
      const message = error.response?.data?.detail || 'Failed to generate share link'
      toast.error(message)
    },
  })
}

export function useJoinByCode() {
  return useMutation({
    mutationFn: sessionsApi.joinByCode,
    onSuccess: () => {
      toast.success('Successfully joined session!')
    },
    onError: (error: any) => {
      const message = error.response?.data?.detail || 'Failed to join session'
      toast.error(message)
    },
  })
}

export function usePublicSessionWithToken(sessionId: string | null, token: string | null) {
  return useQuery({
    queryKey: ['public-session-token', sessionId, token],
    queryFn: () => {
      console.log('🔍 Fetching session with token:', sessionId, token?.substring(0, 10) + '...')
      return sessionsApi.getPublicByToken(sessionId!, token!)
    },
    enabled: !!sessionId && !!token,
    staleTime: 60000, // 1 minute
    gcTime: 5 * 60 * 1000, // 5 minutes
    retry: (failureCount, error: any) => {
      const statusCode = error?.response?.status
      if (statusCode === 401) return false // Invalid token
      if (statusCode === 404) return false // Session not found
      return failureCount < 2
    },
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
    refetchInterval: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    refetchOnMount: true,
  })
}