import { useEffect, useRef, useCallback } from 'react'
import DailyIframe, { DailyCall, DailyEvent, DailyEventObject } from '@daily-co/daily-js'
import { useSessionStore } from '@/stores/session'
import { useSettingsStore } from '@/stores/settings'
import { toast } from 'sonner'
import type { SessionTokens, DailyHookReturn } from '@/types'

export function useDaily(sessionTokens: SessionTokens | null): DailyHookReturn {
  const callRef = useRef<DailyCall | null>(null)
  const { setDailyConnection, dailyConnection } = useSessionStore()
  const { audio: audioSettings } = useSettingsStore()

  const joinCall = useCallback(async () => {
    if (!sessionTokens || callRef.current) return

    try {
      setDailyConnection({ callState: 'joining' })

      // Create Daily call instance
      const call = DailyIframe.createCallObject({
        audioSource: true,
        videoSource: false,
      })

      callRef.current = call

      // Set up event listeners
      call.on('joined-meeting', () => {
        setDailyConnection({ 
          callState: 'joined',
          localAudio: audioSettings.micEnabled 
        })
        toast.success('Connected to translation room')
      })

      call.on('left-meeting', () => {
        setDailyConnection({ 
          callState: 'left',
          participants: {} 
        })
        toast.info('Left translation room')
      })

      call.on('error', (event: DailyEventObject) => {
        console.error('Daily call error:', event)
        setDailyConnection({ callState: 'error' })
        const errorMsg = typeof event.errorMsg === 'string' ? event.errorMsg : 'Unknown error'
        toast.error('Connection error: ' + errorMsg)
      })

      call.on('participant-joined', () => {
        const participants = call.participants()
        setDailyConnection({ participants })
      })

      call.on('participant-left', () => {
        const participants = call.participants()
        setDailyConnection({ participants })
      })

      call.on('participant-updated', () => {
        const participants = call.participants()
        setDailyConnection({ participants })
      })

      call.on('network-quality-change', (event: DailyEventObject) => {
        const quality = event.threshold
        setDailyConnection({ 
          networkQuality: quality === 'good' ? 'good' : 
                         quality === 'low' ? 'warning' : 'bad' 
        })
      })

      // Join the call
      await call.join({
        url: sessionTokens.room_url,
        token: sessionTokens.token,
      })

    } catch (error) {
      console.error('Failed to join call:', error)
      setDailyConnection({ callState: 'error' })
      toast.error('Failed to connect to translation room')
    }
  }, [sessionTokens, setDailyConnection, audioSettings.micEnabled])

  const leaveCall = useCallback(async () => {
    if (!callRef.current) return

    try {
      await callRef.current.leave()
      await callRef.current.destroy()
      callRef.current = null
      setDailyConnection({ 
        callState: 'idle',
        participants: {},
        localAudio: false,
        localVideo: false,
        networkQuality: 'unknown'
      })
    } catch (error) {
      console.error('Failed to leave call:', error)
    }
  }, [setDailyConnection])

  const toggleMicrophone = useCallback(async () => {
    if (!callRef.current) return

    try {
      const newState = !dailyConnection.localAudio
      await callRef.current.setLocalAudio(newState)
      setDailyConnection({ localAudio: newState })
    } catch (error) {
      console.error('Failed to toggle microphone:', error)
      toast.error('Failed to toggle microphone')
    }
  }, [dailyConnection.localAudio, setDailyConnection])

  const setMicrophoneVolume = useCallback(async (volume: number) => {
    // Note: Daily.co doesn't provide direct volume control via API
    // Volume control is typically handled by the browser or OS
    console.log('Microphone volume requested:', volume)
    // This would need to be implemented using Web Audio API or similar
  }, [])

  const setSpeakerVolume = useCallback(async (volume: number) => {
    // Note: Daily.co doesn't provide direct volume control via API
    // Volume control is typically handled by the browser or OS
    console.log('Speaker volume requested:', volume)
    // This would need to be implemented using Web Audio API or similar
  }, [])

  const getNetworkStats = useCallback(async () => {
    if (!callRef.current) return null

    try {
      const stats = await callRef.current.getNetworkStats()
      return stats
    } catch (error) {
      console.error('Failed to get network stats:', error)
      return null
    }
  }, [])

  // Auto-join when session tokens are available
  useEffect(() => {
    if (sessionTokens && dailyConnection.callState === 'idle') {
      joinCall()
    }
  }, [sessionTokens, dailyConnection.callState, joinCall])

  // Apply audio settings
  useEffect(() => {
    if (callRef.current && audioSettings) {
      // Apply settings when available
      // Note: Volume control would be implemented here if supported
    }
  }, [audioSettings?.micVolume, audioSettings?.speakerVolume])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      leaveCall()
    }
  }, [leaveCall])

  return {
    joinCall,
    leaveCall,
    toggleMicrophone,
    setMicrophoneVolume,
    setSpeakerVolume,
    getNetworkStats,
    callState: dailyConnection.callState,
    participants: dailyConnection.participants,
    localAudio: dailyConnection.localAudio,
    localVideo: dailyConnection.localVideo,
    networkQuality: dailyConnection.networkQuality,
  }
}