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