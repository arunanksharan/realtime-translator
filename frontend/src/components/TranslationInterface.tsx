'use client'

import { useEffect, useRef, useState } from 'react'
import { Mic, MicOff, Volume2, VolumeX, Play, Square } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { TranscriptionFeed } from '@/components/TranscriptionFeed'
import { useSessionStore } from '@/stores/session'
import { useStartSession, useStopSession } from '@/hooks/use-sessions'
import { getLanguageName, getLanguageFlag, formatDate } from '@/lib/utils'
import { toast } from 'sonner'
import type { TranslationSession, ConnectionState } from '@/types'

interface TranslationInterfaceProps {
  session: TranslationSession
  websocketConnection: ConnectionState
  dailyConnection: any // From useDaily hook
  transcriptions: any[] // From WebSocket
  currentUserId?: string
}

export function TranslationInterface({
  session,
  websocketConnection,
  dailyConnection,
  transcriptions,
  currentUserId
}: TranslationInterfaceProps) {
  const { translations, isTranslating } = useSessionStore()
  const [isTranslationActive, setIsTranslationActive] = useState(false)
  
  const startSessionMutation = useStartSession()
  const stopSessionMutation = useStopSession()

  const isConnected = websocketConnection.status === 'connected' && 
                     dailyConnection.callState === 'joined'

  const canStartTranslation = isConnected && session.user_b_id && 
                             session.status !== 'active'

  const handleStartTranslation = () => {
    if (!canStartTranslation) {
      toast.error('Please ensure both users are connected before starting translation')
      return
    }
    
    startSessionMutation.mutate(session.session_id, {
      onSuccess: () => {
        setIsTranslationActive(true)
        toast.success('Translation started')
      },
      onError: (error) => {
        toast.error('Failed to start translation')
      }
    })
  }

  const handleStopTranslation = () => {
    stopSessionMutation.mutate(session.session_id, {
      onSuccess: () => {
        setIsTranslationActive(false)
        toast.success('Translation stopped')
      },
      onError: (error) => {
        toast.error('Failed to stop translation')
      }
    })
  }

  // Update local state when session status changes
  useEffect(() => {
    setIsTranslationActive(session.status === 'active')
  }, [session.status])

  return (
    <div className="space-y-6">
      {/* Translation Controls */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Real-time Translation</CardTitle>
            <div className="flex items-center space-x-2">
              {isTranslationActive ? (
                <Button
                  variant="outline"
                  onClick={handleStopTranslation}
                  disabled={stopSessionMutation.isPending}
                  className="text-red-600 border-red-200 hover:bg-red-50"
                >
                  <Square className="h-4 w-4 mr-2" />
                  Stop Translation
                </Button>
              ) : (
                <Button
                  onClick={handleStartTranslation}
                  disabled={!canStartTranslation || startSessionMutation.isPending}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <Play className="h-4 w-4 mr-2" />
                  Start Translation
                </Button>
              )}
              <Badge variant={isTranslationActive ? "default" : "secondary"}>
                {isTranslationActive ? "Active" : "Inactive"}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            {/* User A */}
            <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg">
              <div className="flex items-center space-x-3">
                <span className="language-flag text-xl">
                  {getLanguageFlag(session.language_a)}
                </span>
                <div>
                  <div className="font-medium">{getLanguageName(session.language_a)}</div>
                  <div className="text-sm text-gray-600">You</div>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                {dailyConnection.localAudio ? (
                  <Mic className="h-5 w-5 text-green-600" />
                ) : (
                  <MicOff className="h-5 w-5 text-red-500" />
                )}
                {isTranslationActive && dailyConnection.localAudio && (
                  <div className="flex space-x-1">
                    <div className="w-1 h-4 bg-green-500 rounded animate-pulse"></div>
                    <div className="w-1 h-3 bg-green-400 rounded animate-pulse" style={{ animationDelay: '0.1s' }}></div>
                    <div className="w-1 h-5 bg-green-500 rounded animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                  </div>
                )}
              </div>
            </div>

            {/* User B */}
            <div className="flex items-center justify-between p-4 bg-purple-50 rounded-lg">
              <div className="flex items-center space-x-3">
                <span className="language-flag text-xl">
                  {getLanguageFlag(session.language_b)}
                </span>
                <div>
                  <div className="font-medium">{getLanguageName(session.language_b)}</div>
                  <div className="text-sm text-gray-600">
                    {session.user_b_id ? 'Other user' : 'Waiting...'}
                  </div>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <Volume2 className="h-5 w-5 text-blue-600" />
                {session.user_b_id && (
                  <Badge variant="outline" className="text-xs bg-green-50 text-green-700">
                    Connected
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {/* Connection Status */}
          {!isConnected && (
            <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></div>
                <p className="text-sm text-yellow-800">
                  {websocketConnection.status !== 'connected' 
                    ? 'Connecting to translation service...'
                    : dailyConnection.callState === 'joining'
                    ? 'Connecting to audio...'
                    : 'Waiting for audio connection...'}
                </p>
              </div>
            </div>
          )}

          {/* Requirements Check */}
          {!session.user_b_id && (
            <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                <p className="text-sm text-blue-800">
                  Waiting for another user to join the session. Share your session to get started!
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Live Transcription Feed */}
      <TranscriptionFeed 
        transcriptions={transcriptions}
        session={session}
        currentUserId={currentUserId}
      />

      {/* Help Text */}
      {isTranslationActive && isConnected && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-6 text-sm text-gray-600">
              <div className="flex items-center space-x-2">
                <Mic className="h-4 w-4" />
                <span>Speak clearly into your microphone</span>
              </div>
              <div className="flex items-center space-x-2">
                <Volume2 className="h-4 w-4" />
                <span>Listen to translations through your speakers</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span>Translation is active</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Troubleshooting */}
      {!isConnected && session.user_b_id && (
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-gray-600">
              <p className="font-medium mb-2">Troubleshooting connection issues:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Check your internet connection</li>
                <li>Allow microphone access in your browser</li>
                <li>Try refreshing the page</li>
                <li>Check if other audio applications are using your microphone</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}