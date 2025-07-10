import { useEffect, useRef, useCallback, useState } from 'react'
import DailyIframe, { DailyCall, DailyEvent, DailyEventObject } from '@daily-co/daily-js'
import { useSessionStore } from '@/stores/session'
import { useSettingsStore } from '@/stores/settings'
import { toast } from 'sonner'
import type { SessionTokens, DailyHookReturn } from '@/types'

// Configuration constants
const MAX_RETRY_ATTEMPTS = 3
const RETRY_DELAY_BASE = 2000 // Base delay in ms

export function useDaily(sessionTokens: SessionTokens | null): DailyHookReturn {
  const callRef = useRef<DailyCall | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const { setDailyConnection, dailyConnection } = useSessionStore()
  const { audio: audioSettings } = useSettingsStore()
  
  const [retryCount, setRetryCount] = useState(0)
  const [isRetrying, setIsRetrying] = useState(false)
  const [connectionError, setConnectionError] = useState<string | null>(null)

  const joinCall = useCallback(async () => {
    console.log('🎯 useDaily: Attempting to join call with tokens:', !!sessionTokens)
    
    if (!sessionTokens) {
      console.log('❌ useDaily: No session tokens available')
      return
    }

    if (callRef.current) {
      console.log('⚠️ useDaily: Call already exists, skipping')
      return
    }

    try {
      console.log('🔄 useDaily: Setting state to joining')
      setDailyConnection({ callState: 'joining' })

      console.log('🏗️ useDaily: Creating Daily call object')
      const call = DailyIframe.createCallObject({
        audioSource: true,
        videoSource: false,
      })

      callRef.current = call

      // Enhanced event listeners with debug logging
      call.on('joined-meeting', () => {
        console.log('✅ useDaily: Successfully joined meeting')
        setDailyConnection({ 
          callState: 'joined',
          localAudio: audioSettings.micEnabled || true // Default to true if settings unavailable
        })
        setRetryCount(0) // Reset retry count on success
        setIsRetrying(false)
        setConnectionError(null)
        toast.success('Connected to audio room')
      })

      call.on('left-meeting', () => {
        console.log('👋 useDaily: Left meeting')
        setDailyConnection({ 
          callState: 'left',
          participants: {},
          localAudio: false
        })
        toast.info('Left audio room')
      })

      call.on('error', async (event: DailyEventObject) => {
        console.error('💥 useDaily: Call error:', event)
        const errorMsg = typeof event.errorMsg === 'string' ? event.errorMsg : 'Unknown error'
        setConnectionError(errorMsg)
        
        // Check if we should retry
        if (retryCount < MAX_RETRY_ATTEMPTS && !isRetrying) {
          setIsRetrying(true)
          const delay = RETRY_DELAY_BASE * Math.pow(2, retryCount) // Exponential backoff
          
          toast.warning(`Connection failed, retrying in ${delay/1000}s... (${retryCount + 1}/${MAX_RETRY_ATTEMPTS})`)
          
          // Clean up current call
          try {
            await call.leave()
            await call.destroy()
          } catch (e) {
            console.error('Error cleaning up call:', e)
          }
          callRef.current = null
          
          reconnectTimeoutRef.current = setTimeout(() => {
            setRetryCount(prev => prev + 1)
            setIsRetrying(false)
            joinCall()
          }, delay)
        } else {
          setDailyConnection({ callState: 'error' })
          toast.error(`Audio connection failed: ${errorMsg}`)
        }
      })

      call.on('participant-joined', () => {
        const participants = call.participants()
        console.log('👤 useDaily: Participant joined, total:', Object.keys(participants).length)
        setDailyConnection({ participants })
      })

      call.on('participant-left', () => {
        const participants = call.participants()
        console.log('👋 useDaily: Participant left, total:', Object.keys(participants).length)
        setDailyConnection({ participants })
      })

      call.on('participant-updated', () => {
        const participants = call.participants()
        setDailyConnection({ participants })
      })

      call.on('network-quality-change', (event: DailyEventObject) => {
        const quality = event.threshold
        console.log('📶 useDaily: Network quality changed:', quality)
        setDailyConnection({ 
          networkQuality: quality === 'good' ? 'good' : 
                         quality === 'low' ? 'warning' : 'bad' 
        })
      })

      // Join with detailed logging
      console.log('🚀 useDaily: Joining call with:', {
        room_url: sessionTokens.room_url,
        has_token: !!sessionTokens.token,
        token_length: sessionTokens.token?.length,
        token_preview: sessionTokens.token?.substring(0, 20) + '...'
      })

      await call.join({
        url: sessionTokens.room_url,
        token: sessionTokens.token,
      })

      console.log('📞 useDaily: Join call completed successfully')

    } catch (error) {
      console.error('💥 useDaily: Failed to join call:', error)
      setDailyConnection({ callState: 'error' })
      toast.error(`Failed to connect to audio room: ${error.message || 'Unknown error'}`)
    }
  }, [sessionTokens, setDailyConnection, audioSettings, retryCount, isRetrying])

  const leaveCall = useCallback(async () => {
    // Clear any pending retry timeouts
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }
    
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
      setRetryCount(0)
      setIsRetrying(false)
      setConnectionError(null)
    } catch (error) {
      console.error('Failed to leave call:', error)
    }
  }, [setDailyConnection])

  const toggleMicrophone = useCallback(async () => {
    console.log('🎤 useDaily: Toggle microphone called', {
      hasCall: !!callRef.current,
      currentState: dailyConnection.localAudio,
      callState: dailyConnection.callState
    })

    if (!callRef.current) {
      console.log('❌ useDaily: No call object for mic toggle')
      toast.error('Audio not connected - please wait for connection')
      return
    }

    if (dailyConnection.callState !== 'joined') {
      console.log('❌ useDaily: Call not joined, cannot toggle mic')
      toast.error('Please wait for audio connection to complete')
      return
    }

    try {
      const newState = !dailyConnection.localAudio
      console.log('🔄 useDaily: Setting microphone to:', newState)
      
      await callRef.current.setLocalAudio(newState)
      setDailyConnection({ localAudio: newState })
      
      toast.success(newState ? 'Microphone enabled' : 'Microphone disabled')
      console.log('✅ useDaily: Microphone toggled successfully to:', newState)
    } catch (error) {
      console.error('💥 useDaily: Failed to toggle microphone:', error)
      toast.error('Failed to toggle microphone')
    }
  }, [dailyConnection.localAudio, dailyConnection.callState, setDailyConnection])

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
    console.log('🔍 useDaily: Effect triggered', {
      hasTokens: !!sessionTokens,
      callState: dailyConnection.callState,
      tokenDetails: sessionTokens ? {
        room_url: sessionTokens.room_url,
        token_length: sessionTokens.token?.length
      } : null
    })

    if (sessionTokens && dailyConnection.callState === 'idle') {
      console.log('🎯 useDaily: Auto-joining call')
      joinCall()
    } else if (!sessionTokens) {
      console.log('⏳ useDaily: Waiting for session tokens...')
    } else if (dailyConnection.callState !== 'idle') {
      console.log('🔄 useDaily: Call state is not idle:', dailyConnection.callState)
    }
  }, [sessionTokens, dailyConnection.callState, joinCall])

  // Apply audio settings
  useEffect(() => {
    if (callRef.current && audioSettings) {
      // Apply settings when available
      // Note: Volume control would be implemented here if supported
    }
  }, [audioSettings?.micVolume, audioSettings?.speakerVolume])

  // Manual retry function
  const retry = useCallback(() => {
    if (isRetrying || dailyConnection.callState === 'joining') {
      return
    }
    
    setRetryCount(0)
    setConnectionError(null)
    joinCall()
  }, [isRetrying, dailyConnection.callState, joinCall])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
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
    retry,
    callState: dailyConnection.callState,
    participants: dailyConnection.participants,
    localAudio: dailyConnection.localAudio,
    localVideo: dailyConnection.localVideo,
    networkQuality: dailyConnection.networkQuality,
    connectionError,
    isRetrying,
    retryCount,
  }
}