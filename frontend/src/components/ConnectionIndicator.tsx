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
    if (dailyStatus === 'joined' && websocketStatus === 'connected') {
      return 'Connected'
    } else if (dailyStatus === 'joining' || websocketStatus === 'connecting') {
      return 'Connecting...'
    } else if (dailyStatus === 'error' || websocketStatus === 'failed') {
      return 'Connection Failed'
    } else {
      return 'Disconnected'
    }
  }

  return (
    <div className="flex items-center space-x-3">
      <div className="flex items-center space-x-1">
        {getWebSocketIcon()}
        {getNetworkIcon()}
      </div>
      <span className={`text-sm font-medium ${getDailyStatusColor()}`}>
        {getStatusText()}
      </span>
    </div>
  )
}