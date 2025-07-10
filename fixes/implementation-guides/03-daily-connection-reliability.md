# Implementation Guide: Daily.co Connection Reliability

## Overview
This guide provides comprehensive implementation for improving Daily.co audio connection reliability with proper error handling, retry logic, and real volume controls.

## Implementation Steps

### 1. Enhanced useDaily Hook with Retry Logic

**File**: `/frontend/src/hooks/use-daily.ts`

**Complete implementation with retry logic**:

```typescript
import { useEffect, useRef, useCallback, useState } from 'react'
import DailyIframe, { DailyCall, DailyEvent, DailyEventObject } from '@daily-co/daily-js'
import { useSessionStore } from '@/stores/session'
import { useSettingsStore } from '@/stores/settings'
import { toast } from 'sonner'
import type { SessionTokens, DailyHookReturn } from '@/types'

// Configuration constants
const MAX_RETRY_ATTEMPTS = 3
const RETRY_DELAY_BASE = 2000 // Base delay in ms
const CONNECTION_TIMEOUT = 30000 // 30 seconds
const HEALTH_CHECK_INTERVAL = 10000 // 10 seconds

// Error classification
const RETRYABLE_ERRORS = [
  'connection-error',
  'timeout',
  'network-error',
  'signaling-error'
]

const PERMANENT_ERRORS = [
  'not-allowed',
  'permissions-denied',
  'invalid-token',
  'room-not-found'
]

export function useDaily(sessionTokens: SessionTokens | null): DailyHookReturn {
  const callRef = useRef<DailyCall | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const micGainNodeRef = useRef<GainNode | null>(null)
  const speakerGainNodeRef = useRef<GainNode | null>(null)
  const healthCheckIntervalRef = useRef<NodeJS.Timeout | null>(null)
  
  const { setDailyConnection, dailyConnection } = useSessionStore()
  const { audio: audioSettings } = useSettingsStore()
  
  const [retryCount, setRetryCount] = useState(0)
  const [isRetrying, setIsRetrying] = useState(false)
  const [connectionError, setConnectionError] = useState<string | null>(null)

  // Cleanup function
  const cleanup = useCallback(async () => {
    console.log('🧹 useDaily: Cleaning up resources')
    
    // Clear health check interval
    if (healthCheckIntervalRef.current) {
      clearInterval(healthCheckIntervalRef.current)
      healthCheckIntervalRef.current = null
    }
    
    // Cleanup audio context
    if (audioContextRef.current) {
      try {
        await audioContextRef.current.close()
        audioContextRef.current = null
        micGainNodeRef.current = null
        speakerGainNodeRef.current = null
      } catch (error) {
        console.error('Error closing audio context:', error)
      }
    }
    
    // Leave and destroy call
    if (callRef.current) {
      try {
        await callRef.current.leave()
        await callRef.current.destroy()
      } catch (error) {
        console.error('Error leaving call:', error)
      }
      callRef.current = null
    }
  }, [])

  // Error classification
  const classifyError = useCallback((error: any): 'retry' | 'permanent' | 'unknown' => {
    const errorMessage = error?.message || error?.errorMsg || ''
    const errorCode = error?.errorCode || error?.code || ''
    
    if (PERMANENT_ERRORS.some(e => errorMessage.includes(e) || errorCode.includes(e))) {
      return 'permanent'
    }
    
    if (RETRYABLE_ERRORS.some(e => errorMessage.includes(e) || errorCode.includes(e))) {
      return 'retry'
    }
    
    // Network errors are usually retryable
    if (errorMessage.includes('network') || errorMessage.includes('Network')) {
      return 'retry'
    }
    
    return 'unknown'
  }, [])

  // Get user-friendly error message
  const getErrorMessage = useCallback((error: any): string => {
    const errorMsg = error?.errorMsg || error?.message || 'Unknown error'
    
    if (errorMsg.includes('not-allowed') || errorMsg.includes('permissions')) {
      return 'Microphone access denied. Please check your browser permissions.'
    }
    
    if (errorMsg.includes('network')) {
      return 'Network connection issue. Please check your internet connection.'
    }
    
    if (errorMsg.includes('timeout')) {
      return 'Connection timed out. Please try again.'
    }
    
    if (errorMsg.includes('room-not-found')) {
      return 'Session room not found. It may have expired.'
    }
    
    return `Connection failed: ${errorMsg}`
  }, [])

  // Setup volume control with Web Audio API
  const setupVolumeControl = useCallback(async () => {
    if (!callRef.current) return
    
    try {
      console.log('🎚️ useDaily: Setting up volume control')
      
      // Create audio context if not exists
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext()
      }
      
      // Get local audio track
      const localAudioTrack = callRef.current.localAudio()
      if (localAudioTrack && localAudioTrack instanceof MediaStreamTrack) {
        const stream = new MediaStream([localAudioTrack])
        const source = audioContextRef.current.createMediaStreamSource(stream)
        const gainNode = audioContextRef.current.createGain()
        
        source.connect(gainNode)
        gainNode.connect(audioContextRef.current.destination)
        
        micGainNodeRef.current = gainNode
        console.log('✅ useDaily: Microphone volume control setup complete')
      }
      
      // Note: Speaker volume control would require access to remote audio
      // which is more complex with Daily.co's implementation
      
    } catch (error) {
      console.error('Failed to setup volume control:', error)
    }
  }, [])

  // Network quality handler
  const handleNetworkQualityChange = useCallback((event: DailyEventObject) => {
    const { threshold, quality } = event
    
    let networkQuality: 'good' | 'warning' | 'bad' | 'unknown' = 'unknown'
    
    if (quality === 'good' || threshold === 'good') {
      networkQuality = 'good'
    } else if (quality === 'low' || threshold === 'low') {
      networkQuality = 'warning'
    } else if (quality === 'very-low' || threshold === 'very-low') {
      networkQuality = 'bad'
    }
    
    setDailyConnection({ networkQuality })
    
    // Alert user of poor connection
    if (networkQuality === 'bad' && dailyConnection.callState === 'joined') {
      toast.warning('Poor network connection detected. Audio quality may be affected.')
    }
    
    // Log detailed stats if available
    if (event.stats) {
      console.log('📊 Network stats:', {
        videoRecvBitsPerSecond: event.stats.videoRecvBitsPerSecond,
        audioRecvBitsPerSecond: event.stats.audioRecvBitsPerSecond,
        videoSendBitsPerSecond: event.stats.videoSendBitsPerSecond,
        audioSendBitsPerSecond: event.stats.audioSendBitsPerSecond,
        networkRoundTripTime: event.stats.networkRoundTripTime,
        packetLoss: event.stats.packetLoss,
      })
    }
  }, [setDailyConnection, dailyConnection.callState])

  // Health check function
  const performHealthCheck = useCallback(async () => {
    if (!callRef.current || dailyConnection.callState !== 'joined') return
    
    try {
      const stats = await callRef.current.getNetworkStats()
      
      if (stats?.stats?.latest) {
        const latest = stats.stats.latest
        
        // Check for high packet loss
        if (latest.audioRecvPacketLoss > 0.05) { // 5% loss
          console.warn('⚠️ High audio packet loss detected:', latest.audioRecvPacketLoss)
          toast.warning('Audio quality degraded due to packet loss')
        }
        
        // Check for poor network RTT
        if (latest.networkRoundTripTime > 150) { // 150ms
          console.warn('⚠️ High network latency:', latest.networkRoundTripTime)
        }
      }
    } catch (error) {
      console.error('Health check failed:', error)
    }
  }, [callRef, dailyConnection.callState])

  // Main join function with retry logic
  const joinCall = useCallback(async () => {
    console.log('🎯 useDaily: joinCall called', {
      hasTokens: !!sessionTokens,
      retryCount,
      isRetrying,
      existingCall: !!callRef.current
    })
    
    if (!sessionTokens) {
      console.log('❌ useDaily: No session tokens available')
      return
    }
    
    if (callRef.current) {
      console.log('⚠️ useDaily: Call already exists')
      return
    }
    
    if (isRetrying) {
      console.log('⏳ useDaily: Already retrying')
      return
    }
    
    try {
      setDailyConnection({ callState: 'joining' })
      setConnectionError(null)
      
      console.log('🏗️ useDaily: Creating Daily call object')
      const call = DailyIframe.createCallObject({
        audioSource: true,
        videoSource: false,
        dailyConfig: {
          experimentalChromeVideoMuteLightOff: true,
          camSimulcastEncodings: false,
          enableIndependentDevicePermissionPrompts: true,
        }
      })
      
      // Setup comprehensive event handlers
      call.on('joined-meeting', async () => {
        console.log('✅ useDaily: Successfully joined meeting')
        setDailyConnection({ 
          callState: 'joined',
          localAudio: audioSettings.micEnabled !== false
        })
        setRetryCount(0)
        setIsRetrying(false)
        toast.success('Connected to audio room')
        
        // Setup volume control after joining
        await setupVolumeControl()
        
        // Start health checks
        healthCheckIntervalRef.current = setInterval(performHealthCheck, HEALTH_CHECK_INTERVAL)
      })
      
      call.on('left-meeting', () => {
        console.log('👋 useDaily: Left meeting')
        setDailyConnection({ 
          callState: 'left',
          participants: {},
          localAudio: false
        })
        toast.info('Disconnected from audio room')
      })
      
      call.on('error', async (event: DailyEventObject) => {
        console.error('💥 useDaily: Call error:', event)
        const errorType = classifyError(event)
        const errorMessage = getErrorMessage(event)
        
        setConnectionError(errorMessage)
        
        if (errorType === 'retry' && retryCount < MAX_RETRY_ATTEMPTS) {
          setIsRetrying(true)
          const delay = RETRY_DELAY_BASE * Math.pow(2, retryCount) // Exponential backoff
          
          toast.warning(`Connection failed, retrying in ${delay/1000}s... (${retryCount + 1}/${MAX_RETRY_ATTEMPTS})`)
          
          await cleanup()
          
          setTimeout(() => {
            setRetryCount(prev => prev + 1)
            setIsRetrying(false)
            joinCall()
          }, delay)
        } else {
          setDailyConnection({ callState: 'error' })
          toast.error(errorMessage)
          
          if (errorType === 'permanent') {
            // Don't retry permanent errors
            setRetryCount(MAX_RETRY_ATTEMPTS)
          }
        }
      })
      
      // Participant events
      call.on('participant-joined', (event) => {
        const participants = call.participants()
        console.log('👤 useDaily: Participant joined, total:', Object.keys(participants).length)
        setDailyConnection({ participants })
      })
      
      call.on('participant-left', (event) => {
        const participants = call.participants()
        console.log('👋 useDaily: Participant left, total:', Object.keys(participants).length)
        setDailyConnection({ participants })
      })
      
      call.on('participant-updated', (event) => {
        const participants = call.participants()
        setDailyConnection({ participants })
      })
      
      // Network quality monitoring
      call.on('network-quality-change', handleNetworkQualityChange)
      
      // Permission errors
      call.on('camera-error', (event) => {
        if (event.error?.type === 'permissions') {
          setDailyConnection({ callState: 'error' })
          toast.error('Camera access denied')
        }
      })
      
      call.on('mic-error', (event) => {
        if (event.error?.type === 'permissions') {
          setDailyConnection({ callState: 'error' })
          toast.error('Microphone access denied. Please check your browser permissions.')
          setConnectionError('Microphone permissions denied')
        }
      })
      
      // Set timeout for join operation
      const joinTimeout = setTimeout(() => {
        throw new Error('Connection timeout - took too long to join')
      }, CONNECTION_TIMEOUT)
      
      console.log('🚀 useDaily: Joining call with tokens')
      await call.join({
        url: sessionTokens.room_url,
        token: sessionTokens.token,
      })
      
      clearTimeout(joinTimeout)
      callRef.current = call
      
      console.log('📞 useDaily: Join completed successfully')
      
    } catch (error: any) {
      console.error('💥 useDaily: Failed to join call:', error)
      
      const errorType = classifyError(error)
      const errorMessage = getErrorMessage(error)
      
      setConnectionError(errorMessage)
      setDailyConnection({ callState: 'error' })
      
      // Retry logic for join failures
      if (errorType === 'retry' && retryCount < MAX_RETRY_ATTEMPTS && !isRetrying) {
        setIsRetrying(true)
        const delay = RETRY_DELAY_BASE * Math.pow(2, retryCount)
        
        toast.warning(`Failed to connect, retrying in ${delay/1000}s...`)
        
        setTimeout(() => {
          setRetryCount(prev => prev + 1)
          setIsRetrying(false)
          joinCall()
        }, delay)
      } else {
        toast.error(errorMessage)
      }
    }
  }, [
    sessionTokens, 
    retryCount, 
    isRetrying, 
    setDailyConnection, 
    audioSettings,
    cleanup,
    classifyError,
    getErrorMessage,
    setupVolumeControl,
    performHealthCheck,
    handleNetworkQualityChange
  ])

  // Leave call function
  const leaveCall = useCallback(async () => {
    console.log('🚪 useDaily: Leaving call')
    await cleanup()
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
  }, [cleanup, setDailyConnection])

  // Toggle microphone with better error handling
  const toggleMicrophone = useCallback(async () => {
    console.log('🎤 useDaily: Toggle microphone called')
    
    if (!callRef.current) {
      toast.error('Not connected to audio room')
      return
    }
    
    if (dailyConnection.callState !== 'joined') {
      toast.error('Please wait for connection to complete')
      return
    }
    
    try {
      const newState = !dailyConnection.localAudio
      await callRef.current.setLocalAudio(newState)
      setDailyConnection({ localAudio: newState })
      toast.success(newState ? 'Microphone enabled' : 'Microphone disabled')
    } catch (error) {
      console.error('Failed to toggle microphone:', error)
      toast.error('Failed to toggle microphone')
    }
  }, [dailyConnection, setDailyConnection])

  // Volume control functions
  const setMicrophoneVolume = useCallback(async (volume: number) => {
    if (micGainNodeRef.current && audioContextRef.current) {
      const gain = volume / 100 // Convert percentage to 0-1
      micGainNodeRef.current.gain.setValueAtTime(
        gain, 
        audioContextRef.current.currentTime
      )
      console.log('🎚️ Microphone volume set to:', volume)
    }
  }, [])

  const setSpeakerVolume = useCallback(async (volume: number) => {
    // This is more complex with Daily.co as we don't have direct access
    // to the remote audio stream. Would need to implement differently.
    console.log('🔊 Speaker volume requested:', volume)
    // Possible implementation: adjust system volume or use CSS audio filters
  }, [])

  // Get network statistics
  const getNetworkStats = useCallback(async () => {
    if (!callRef.current || dailyConnection.callState !== 'joined') {
      return null
    }
    
    try {
      const stats = await callRef.current.getNetworkStats()
      return stats
    } catch (error) {
      console.error('Failed to get network stats:', error)
      return null
    }
  }, [dailyConnection.callState])

  // Manual retry function
  const retry = useCallback(() => {
    if (isRetrying || dailyConnection.callState === 'joining') {
      return
    }
    
    setRetryCount(0)
    setConnectionError(null)
    joinCall()
  }, [isRetrying, dailyConnection.callState, joinCall])

  // Auto-join when tokens available
  useEffect(() => {
    if (sessionTokens && dailyConnection.callState === 'idle' && !isRetrying) {
      console.log('🎯 useDaily: Auto-joining with new tokens')
      joinCall()
    }
  }, [sessionTokens, dailyConnection.callState, isRetrying, joinCall])

  // Apply audio settings
  useEffect(() => {
    if (callRef.current && audioSettings && dailyConnection.callState === 'joined') {
      // Apply microphone volume
      if (audioSettings.micVolume !== undefined) {
        setMicrophoneVolume(audioSettings.micVolume)
      }
      
      // Apply speaker volume (if implemented)
      if (audioSettings.speakerVolume !== undefined) {
        setSpeakerVolume(audioSettings.speakerVolume)
      }
    }
  }, [
    audioSettings?.micVolume, 
    audioSettings?.speakerVolume, 
    dailyConnection.callState,
    setMicrophoneVolume,
    setSpeakerVolume
  ])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      console.log('🧹 useDaily: Component unmounting, cleaning up')
      cleanup()
    }
  }, [cleanup])

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
```

### 2. Update Types for Enhanced Hook

**File**: `/frontend/src/types/index.ts`

**Add to DailyHookReturn interface**:

```typescript
export interface DailyHookReturn {
  joinCall: () => Promise<void>
  leaveCall: () => Promise<void>
  toggleMicrophone: () => Promise<void>
  setMicrophoneVolume: (volume: number) => Promise<void>
  setSpeakerVolume: (volume: number) => Promise<void>
  getNetworkStats: () => Promise<any | null>
  retry: () => void // Manual retry function
  callState: DailyCallState['callState']
  participants: DailyCallState['participants']
  localAudio: DailyCallState['localAudio']
  localVideo: DailyCallState['localVideo']
  networkQuality: DailyCallState['networkQuality']
  connectionError: string | null // Current error message
  isRetrying: boolean // Retry in progress
  retryCount: number // Number of retries attempted
}

// Update call state to include more states
export interface DailyCallState {
  callState: 'idle' | 'preparing' | 'joining' | 'joined' | 'reconnecting' | 'left' | 'error' | 'blocked'
  participants: Record<string, any>
  localAudio: boolean
  localVideo: boolean
  networkQuality: 'good' | 'warning' | 'bad' | 'unknown'
}
```

### 3. Enhanced Audio Controls Card

**File**: `/frontend/src/components/AudioControlsCard.tsx`

**Update to show retry options and better error handling**:

```typescript
// Add to the component
{connectionStatus.label === 'Error' && daily.connectionError && (
  <div className="mt-2 p-2 bg-red-50 rounded-md">
    <p className="text-xs text-red-700 mb-2">{daily.connectionError}</p>
    <Button
      size="sm"
      variant="outline"
      onClick={daily.retry}
      disabled={daily.isRetrying}
      className="w-full"
    >
      {daily.isRetrying ? (
        <>
          <Loader2 className="h-3 w-3 mr-2 animate-spin" />
          Retrying... ({daily.retryCount}/{3})
        </>
      ) : (
        'Retry Connection'
      )}
    </Button>
  </div>
)}

// Add retry indicator
{daily.isRetrying && (
  <div className="flex items-center space-x-2 text-xs text-yellow-600">
    <Loader2 className="h-3 w-3 animate-spin" />
    <span>Reconnecting...</span>
  </div>
)}
```

### 4. Connection Quality Indicator Component

**File**: `/frontend/src/components/ConnectionQualityIndicator.tsx`

```typescript
import { cn } from '@/lib/utils'
import { Wifi, WifiOff, AlertTriangle } from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface ConnectionQualityIndicatorProps {
  quality: 'good' | 'warning' | 'bad' | 'unknown'
  className?: string
}

export function ConnectionQualityIndicator({ 
  quality, 
  className 
}: ConnectionQualityIndicatorProps) {
  const getIcon = () => {
    switch (quality) {
      case 'good':
        return <Wifi className="h-4 w-4 text-green-500" />
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />
      case 'bad':
        return <WifiOff className="h-4 w-4 text-red-500" />
      default:
        return <Wifi className="h-4 w-4 text-gray-400" />
    }
  }
  
  const getMessage = () => {
    switch (quality) {
      case 'good':
        return 'Excellent connection quality'
      case 'warning':
        return 'Fair connection - may experience some issues'
      case 'bad':
        return 'Poor connection - audio quality affected'
      default:
        return 'Connection quality unknown'
    }
  }
  
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn("flex items-center", className)}>
            {getIcon()}
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs">{getMessage()}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
```

## Testing the Implementation

1. **Test Retry Logic**
   - Disconnect network briefly
   - Verify automatic retry attempts
   - Check exponential backoff timing

2. **Test Permission Errors**
   - Deny microphone permission
   - Verify error message clarity
   - Test retry after granting permission

3. **Test Volume Controls**
   - Adjust microphone volume
   - Verify gain changes in audio

4. **Test Health Monitoring**
   - Simulate poor network
   - Check packet loss warnings
   - Verify quality indicators

## Next Steps

1. Implement the enhanced hook
2. Update AudioControlsCard with retry UI
3. Add ConnectionQualityIndicator to session page
4. Test various failure scenarios
5. Monitor performance impact of health checks
