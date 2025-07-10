'use client'

import { Wifi, WifiOff, Signal, SignalHigh, SignalLow, SignalMedium } from 'lucide-react'
import type { ConnectionState, DailyCallState } from '@/types'

interface ConnectionIndicatorProps {
  websocketStatus: ConnectionState['status']
  dailyStatus: DailyCallState['callState']
  networkQuality: DailyCallState['networkQuality']
}

export function ConnectionIndicator({ 
  websocketStatus, 
  dailyStatus, 
  networkQuality 
}: ConnectionIndicatorProps) {
  const getWebSocketIcon = () => {
    switch (websocketStatus) {
      case 'connected':
        return <Wifi className="h-4 w-4 text-green-500" />
      case 'connecting':
        return <Wifi className="h-4 w-4 text-yellow-500 animate-pulse" />
      case 'disconnected':
      case 'failed':
        return <WifiOff className="h-4 w-4 text-red-500" />
      default:
        return <WifiOff className="h-4 w-4 text-gray-400" />
    }
  }

  const getNetworkIcon = () => {
    switch (networkQuality) {
      case 'good':
        return <SignalHigh className="h-4 w-4 text-green-500" />
      case 'warning':
        return <SignalMedium className="h-4 w-4 text-yellow-500" />
      case 'bad':
        return <SignalLow className="h-4 w-4 text-red-500" />
      default:
        return <Signal className="h-4 w-4 text-gray-400" />
    }
  }

  const getDailyStatusColor = () => {
    switch (dailyStatus) {
      case 'joined':
        return 'text-green-500'
      case 'joining':
        return 'text-yellow-500'
      case 'error':
        return 'text-red-500'
      default:
        return 'text-gray-400'
    }
  }

  const getStatusText = () => {
    // More detailed status messages for debugging
    if (websocketStatus === 'connecting' && dailyStatus === 'idle') {
      return 'Connecting to server...'
    } else if (websocketStatus === 'connected' && dailyStatus === 'joining') {
      return 'Connecting to audio...'
    } else if (websocketStatus === 'connected' && dailyStatus === 'joined') {
      return 'Connected'
    } else if (websocketStatus === 'failed' || dailyStatus === 'error') {
      return 'Connection Failed'
    } else if (websocketStatus === 'disconnected') {
      return 'Disconnected from server'
    } else if (websocketStatus === 'connected' && dailyStatus === 'idle') {
      return 'Server connected, audio pending...'
    } else {
      return `WS: ${websocketStatus}, Audio: ${dailyStatus}`
    }
  }

  const getStatusColor = () => {
    if (websocketStatus === 'connected' && dailyStatus === 'joined') {
      return 'text-green-500'
    } else if (websocketStatus === 'connecting' || dailyStatus === 'joining') {
      return 'text-yellow-500'
    } else if (websocketStatus === 'failed' || dailyStatus === 'error') {
      return 'text-red-500'
    } else {
      return 'text-gray-500'
    }
  }

  return (
    <div className="flex items-center space-x-3">
      <div className="flex items-center space-x-1">
        {getWebSocketIcon()}
        {getNetworkIcon()}
      </div>
      <span className={`text-sm font-medium ${getStatusColor()}`}>
        {getStatusText()}
      </span>
    </div>
  )
}