# Issue 4 Fix: Daily.co Audio Connection and Error Handling

## Problem
1. Daily.co connection sometimes fails silently
2. Limited error recovery mechanisms
3. Volume controls not actually working (just placeholders)
4. No retry logic for failed connections
5. Missing connection quality monitoring

## Analysis
The Daily.co integration is mostly functional but lacks:
- Comprehensive error handling
- Automatic reconnection logic
- Real volume control implementation
- Better connection state management

## Solution Implementation

### 1. Enhanced Error Handling and Retry Logic
Update the `useDaily` hook with better error handling:

```typescript
// Add retry configuration
const MAX_RETRY_ATTEMPTS = 3
const RETRY_DELAY_MS = 2000

// Add retry state
const [retryCount, setRetryCount] = useState(0)
const [isRetrying, setIsRetrying] = useState(false)

const joinCall = useCallback(async () => {
  if (!sessionTokens || callRef.current) return
  
  try {
    setDailyConnection({ callState: 'joining' })
    
    const call = DailyIframe.createCallObject({
      audioSource: true,
      videoSource: false,
      // Add error recovery options
      dailyConfig: {
        experimentalChromeVideoMuteLightOff: true,
        camSimulcastEncodings: false,
      }
    })
    
    // Enhanced error handling
    call.on('error', async (event) => {
      const errorCode = event.errorMsg?.errorCode
      const canRetry = retryCount < MAX_RETRY_ATTEMPTS
      
      if (canRetry && shouldRetryError(errorCode)) {
        setIsRetrying(true)
        toast.warning(`Connection failed, retrying... (${retryCount + 1}/${MAX_RETRY_ATTEMPTS})`)
        
        await cleanup()
        setTimeout(() => {
          setRetryCount(prev => prev + 1)
          joinCall()
        }, RETRY_DELAY_MS)
      } else {
        toast.error(getErrorMessage(event))
        setDailyConnection({ callState: 'error' })
      }
    })
    
    // Network quality monitoring
    call.on('network-quality-change', (event) => {
      handleNetworkQualityChange(event)
    })
    
    // Join with timeout
    const joinTimeout = setTimeout(() => {
      throw new Error('Join timeout - connection took too long')
    }, 30000)
    
    await call.join({
      url: sessionTokens.room_url,
      token: sessionTokens.token,
    })
    
    clearTimeout(joinTimeout)
    callRef.current = call
    setRetryCount(0)
    setIsRetrying(false)
    
  } catch (error) {
    handleJoinError(error)
  }
}, [sessionTokens, retryCount])
```

### 2. Volume Control Implementation
Implement actual volume control using Web Audio API:

```typescript
const implementVolumeControl = useCallback(async () => {
  if (!callRef.current) return
  
  try {
    // Get local audio track
    const localAudio = callRef.current.localAudio()
    if (!localAudio) return
    
    // Create audio context
    const audioContext = new AudioContext()
    const source = audioContext.createMediaStreamSource(localAudio)
    const gainNode = audioContext.createGain()
    
    // Connect nodes
    source.connect(gainNode)
    gainNode.connect(audioContext.destination)
    
    // Store gain node for volume control
    audioGainRef.current = gainNode
    
  } catch (error) {
    console.error('Failed to setup volume control:', error)
  }
}, [])

const setMicrophoneVolume = useCallback(async (volume: number) => {
  if (audioGainRef.current) {
    // Convert percentage to gain value (0-1)
    const gain = volume / 100
    audioGainRef.current.gain.setValueAtTime(gain, audioContext.currentTime)
  }
}, [])
```

### 3. Connection Quality Monitoring
Add comprehensive network quality monitoring:

```typescript
const handleNetworkQualityChange = (event: DailyEventObject) => {
  const { threshold, quality } = event
  
  // Map Daily.co quality to our format
  const networkQuality = mapNetworkQuality(quality)
  setDailyConnection({ networkQuality })
  
  // Alert user of poor connection
  if (networkQuality === 'bad') {
    toast.warning('Poor network connection detected')
  }
  
  // Log detailed stats
  if (event.stats) {
    console.log('Network stats:', {
      videoRecvBitsPerSecond: event.stats.videoRecvBitsPerSecond,
      audioRecvBitsPerSecond: event.stats.audioRecvBitsPerSecond,
      videoSendBitsPerSecond: event.stats.videoSendBitsPerSecond,
      audioSendBitsPerSecond: event.stats.audioSendBitsPerSecond,
      networkRoundTripTime: event.stats.networkRoundTripTime,
    })
  }
}
```

### 4. Enhanced Connection State Management
Add more granular connection states:

```typescript
type EnhancedCallState = 
  | 'idle'
  | 'preparing'
  | 'joining'
  | 'joined'
  | 'reconnecting'
  | 'left'
  | 'error'
  | 'blocked' // Permissions denied

// Handle permission errors
call.on('camera-error', handlePermissionError)
call.on('mic-error', handlePermissionError)

const handlePermissionError = (event: DailyEventObject) => {
  if (event.error?.type === 'permissions') {
    setDailyConnection({ callState: 'blocked' })
    toast.error('Microphone access denied. Please check your browser permissions.')
  }
}
```

### 5. Auto-recovery and Health Checks
Add connection health monitoring:

```typescript
// Periodic health check
useEffect(() => {
  if (callRef.current && dailyConnection.callState === 'joined') {
    const healthCheckInterval = setInterval(async () => {
      try {
        const stats = await callRef.current.getNetworkStats()
        
        if (stats.latest.videoRecvPacketLoss > 0.1) {
          toast.warning('High packet loss detected')
        }
        
      } catch (error) {
        console.error('Health check failed:', error)
      }
    }, 10000) // Every 10 seconds
    
    return () => clearInterval(healthCheckInterval)
  }
}, [dailyConnection.callState])
```

## Implementation Summary

### Files to Update
1. `/frontend/src/hooks/use-daily.ts` - Main implementation
2. `/frontend/src/components/AudioControlsCard.tsx` - UI updates
3. `/frontend/src/types/index.ts` - Add new types

### Key Improvements
- ✅ Automatic retry on connection failure
- ✅ Real volume control implementation
- ✅ Network quality monitoring
- ✅ Permission error handling
- ✅ Connection health checks
- ✅ Better error messages

### Error Recovery Flow
```
Connection Attempt
    ↓
Error Occurs → Classify Error
    ↓
Retryable? → Yes → Wait → Retry (up to 3 times)
    ↓ No
Show Error → Provide Recovery Options
    ↓
Manual Retry or Permission Fix
```

## Next Steps
1. Implement the enhanced error handling
2. Add Web Audio API for volume control
3. Create connection quality indicator UI
4. Add manual retry button
5. Implement permission request flow
