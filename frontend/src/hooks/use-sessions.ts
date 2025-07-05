import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { sessionsApi } from '@/lib/api'
import { useSessionStore } from '@/stores/session'
import type { CreateSessionRequest } from '@/types'

export function useCreateSession() {
  const setCurrentSession = useSessionStore((state) => state.setCurrentSession)
  const queryClient = useQueryClient()
  const router = useRouter()

  return useMutation({
    mutationFn: sessionsApi.create,
    onSuccess: (data) => {
      setCurrentSession(data)
      queryClient.invalidateQueries({ queryKey: ['sessions'] })
      toast.success('Translation session created!')
      // Navigate to the session page
      router.push(`/session/${data.session_id}`)
    },
    onError: (error: any) => {
      console.error('Create session error:', error)
      const message = error.response?.data?.detail || 'Failed to create session'
      toast.error(message)
    },
  })
}

export function useJoinSession() {
  const setCurrentSession = useSessionStore((state) => state.setCurrentSession)
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
  const updateSessionStatus = useSessionStore((state) => state.updateSessionStatus)
  const setTranslating = useSessionStore((state) => state.setTranslating)
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: sessionsApi.start,
    onSuccess: (_, sessionId) => {
      updateSessionStatus('active')
      setTranslating(true)
      queryClient.invalidateQueries({ queryKey: ['session', sessionId] })
      toast.success('Translation started!')
    },
    onError: (error: any) => {
      const message = error.response?.data?.detail || 'Failed to start translation'
      toast.error(message)
    },
  })
}

export function useStopSession() {
  const updateSessionStatus = useSessionStore((state) => state.updateSessionStatus)
  const setTranslating = useSessionStore((state) => state.setTranslating)
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: sessionsApi.stop,
    onSuccess: (_, sessionId) => {
      updateSessionStatus('completed')
      setTranslating(false)
      queryClient.invalidateQueries({ queryKey: ['session', sessionId] })
      toast.success('Translation stopped')
    },
    onError: (error: any) => {
      const message = error.response?.data?.detail || 'Failed to stop translation'
      toast.error(message)
    },
  })
}

export function useSession(sessionId: string | null) {
  return useQuery({
    queryKey: ['session', sessionId],
    queryFn: () => sessionsApi.get(sessionId!),
    enabled: !!sessionId,
    refetchInterval: 10000, // Refetch every 10 seconds
  })
}

export function useSessions(limit = 10) {
  return useQuery({
    queryKey: ['sessions', limit],
    queryFn: () => sessionsApi.list(limit),
    staleTime: 30000, // 30 seconds
  })
}

export function useSessionTokens(sessionId: string | null) {
  return useQuery({
    queryKey: ['session-tokens', sessionId],
    queryFn: () => sessionsApi.getTokens(sessionId!),
    enabled: !!sessionId,
    staleTime: 60000, // 1 minute
  })
}

export function useSessionMetrics(sessionId: string | null) {
  const setSessionMetrics = useSessionStore((state) => state.setSessionMetrics)

  return useQuery({
    queryKey: ['session-metrics', sessionId],
    queryFn: () => sessionsApi.getMetrics(sessionId!),
    enabled: !!sessionId,
    refetchInterval: 5000, // Refetch every 5 seconds
    onSuccess: (data) => {
      setSessionMetrics(data)
    },
  })
}