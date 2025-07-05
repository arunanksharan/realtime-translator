'use client'

import { useState } from 'react'
import { Mic, MicOff, Volume2, VolumeX, Settings } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { DailyHookReturn } from '@/types'

interface AudioControlsCardProps {
  daily: DailyHookReturn
  className?: string
}

export function AudioControlsCard({ daily, className }: AudioControlsCardProps) {
  const [micVolume, setMicVolume] = useState(75)
  const [speakerVolume, setSpeakerVolume] = useState(75)
  const [speakerMuted, setSpeakerMuted] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)

  const handleMicVolumeChange = (value: number[]) => {
    const volume = value[0]
    setMicVolume(volume)
    daily.setMicrophoneVolume(volume).catch(console.error)
  }

  const handleSpeakerVolumeChange = (value: number[]) => {
    const volume = value[0]
    setSpeakerVolume(volume)
    daily.setSpeakerVolume(volume).catch(console.error)
  }

  const getNetworkQualityColor = (quality: string) => {
    switch (quality) {
      case 'good':
        return 'bg-green-500'
      case 'warning':
        return 'bg-yellow-500'
      case 'bad':
        return 'bg-red-500'
      default:
        return 'bg-gray-500'
    }
  }

  const getNetworkQualityBars = (quality: string) => {
    const level = quality === 'good' ? 5 : quality === 'warning' ? 3 : quality === 'bad' ? 1 : 0
    return Array.from({ length: 5 }, (_, i) => (
      <div
        key={i}
        className={cn(
          "w-1 h-3 rounded-full",
          i < level ? getNetworkQualityColor(quality) : 'bg-gray-300'
        )}
      />
    ))
  }

  const getConnectionStatus = () => {
    switch (daily.callState) {
      case 'joined':
        return { label: 'Connected', color: 'bg-green-500' }
      case 'joining':
        return { label: 'Connecting...', color: 'bg-yellow-500' }
      case 'error':
        return { label: 'Error', color: 'bg-red-500' }
      default:
        return { label: 'Disconnected', color: 'bg-gray-500' }
    }
  }

  const connectionStatus = getConnectionStatus()
  const isConnected = daily.callState === 'joined'

  return (
    <Card className={cn("w-full", className)}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-sm">
          <span>Audio Controls</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            <Settings className="h-4 w-4" />
          </Button>
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Connection Status */}
        <div className="flex items-center justify-between">
          <Label className="text-sm">Connection</Label>
          <div className="flex items-center space-x-2">
            <Badge
              variant={isConnected ? 'default' : 'secondary'}
              className={cn(
                "text-xs",
                isConnected ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
              )}
            >
              {connectionStatus.label}
            </Badge>
            {daily.networkQuality && daily.networkQuality !== 'unknown' && (
              <div className="flex space-x-1">
                {getNetworkQualityBars(daily.networkQuality)}
              </div>
            )}
          </div>
        </div>

        {/* Microphone Control */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm">Microphone</Label>
            <Button
              variant={daily.localAudio ? "default" : "outline"}
              size="sm"
              onClick={() => daily.toggleMicrophone().catch(console.error)}
              disabled={!isConnected}
              className={cn(
                "transition-colors",
                daily.localAudio 
                  ? "bg-green-600 hover:bg-green-700 text-white" 
                  : "border-gray-300 hover:bg-gray-100"
              )}
            >
              {daily.localAudio ? (
                <Mic className="h-4 w-4" />
              ) : (
                <MicOff className="h-4 w-4" />
              )}
            </Button>
          </div>
          
          {showAdvanced && (
            <div className="flex items-center space-x-2">
              <Volume2 className="h-4 w-4 text-gray-500" />
              <Slider
                value={[micVolume]}
                onValueChange={handleMicVolumeChange}
                max={100}
                step={1}
                className="flex-1"
                disabled={!daily.localAudio || !isConnected}
              />
              <span className="text-sm text-gray-500 w-10">{micVolume}%</span>
            </div>
          )}
        </div>

        {/* Speaker Control */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm">Speaker</Label>
            <Button
              variant={speakerMuted ? "outline" : "default"}
              size="sm"
              onClick={() => setSpeakerMuted(!speakerMuted)}
              disabled={!isConnected}
              className={cn(
                "transition-colors",
                !speakerMuted 
                  ? "bg-blue-600 hover:bg-blue-700 text-white" 
                  : "border-gray-300 hover:bg-gray-100"
              )}
            >
              {speakerMuted ? (
                <VolumeX className="h-4 w-4" />
              ) : (
                <Volume2 className="h-4 w-4" />
              )}
            </Button>
          </div>
          
          {showAdvanced && (
            <div className="flex items-center space-x-2">
              <Volume2 className="h-4 w-4 text-gray-500" />
              <Slider
                value={[speakerVolume]}
                onValueChange={handleSpeakerVolumeChange}
                max={100}
                step={1}
                className="flex-1"
                disabled={speakerMuted || !isConnected}
              />
              <span className="text-sm text-gray-500 w-10">{speakerVolume}%</span>
            </div>
          )}
        </div>

        {/* Participants Count */}
        <div className="pt-2 border-t">
          <div className="flex items-center justify-between">
            <Label className="text-sm">Participants</Label>
            <Badge variant="outline" className="text-xs">
              {Object.keys(daily.participants || {}).length + 1} connected
            </Badge>
          </div>
        </div>

        {/* Network Quality Details */}
        {showAdvanced && daily.networkQuality && daily.networkQuality !== 'unknown' && (
          <div className="pt-2 border-t">
            <div className="flex items-center justify-between">
              <Label className="text-sm">Network Quality</Label>
              <div className="flex items-center space-x-2">
                <div className="flex space-x-1">
                  {getNetworkQualityBars(daily.networkQuality)}
                </div>
                <span className="text-xs text-gray-500 capitalize">
                  {daily.networkQuality}
                </span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
