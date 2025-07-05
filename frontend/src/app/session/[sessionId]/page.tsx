'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Settings, Users, Mic, MicOff, Volume2, VolumeX } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { TranslationInterface } from '@/components/TranslationInterface'
import { SessionStatus } from '@/components/SessionStatus'
import { ConnectionIndicator } from '@/components/ConnectionIndicator'
import { useAuthStore } from '@/stores/auth'
import { useSessionStore } from '@/stores/session'
import { useSession, useSessionTokens } from '@/hooks/use-sessions'
import { useWebSocket } from '@/hooks/use-websocket'
import { useDaily } from '@/hooks/use-daily'
import { formatDate, getLanguageName, getLanguageFlag } from '@/lib/utils'

export default function SessionPage() {
  const params = useParams()
  const router = useRouter()
  const sessionId = params.sessionId as string
  
  const { isAuthenticated } = useAuthStore()
  const { 
    setCurrentSession, 
    currentSession, 
    dailyConnection,
    setShowSettings,
    showSettings 
  } = useSessionStore()

  // Fetch session data
  const { data: session, isLoading: sessionLoading } = useSession(sessionId)
  const { data: sessionTokens } = useSessionTokens(sessionId)

  // WebSocket connection for real-time updates
  const websocket = useWebSocket(sessionId)
  
  // Daily.co integration for audio
  const daily = useDaily(sessionTokens || null)

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/auth/login')
      return
    }
  }, [isAuthenticated, router])

  useEffect(() => {
    if (session) {
      setCurrentSession(session)
    }
  }, [session, setCurrentSession])

  if (!isAuthenticated) {
    return null
  }

  if (sessionLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-300">Loading session...</p>
        </div>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center">
            <h2 className="text-xl font-semibold mb-2">Session Not Found</h2>
            <p className="text-gray-600 mb-4">
              The translation session you're looking for doesn't exist or has expired.
            </p>
            <Button onClick={() => router.push('/dashboard')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm dark:bg-gray-900/80">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push('/dashboard')}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Dashboard
              </Button>
              
              <div className="flex items-center space-x-3">
                <div className="flex items-center space-x-2">
                  <span className="language-flag text-lg">
                    {getLanguageFlag(session.language_a)}
                  </span>
                  <span className="font-medium">
                    {getLanguageName(session.language_a)}
                  </span>
                </div>
                
                <div className="text-gray-400">⟷</div>
                
                <div className="flex items-center space-x-2">
                  <span className="language-flag text-lg">
                    {getLanguageFlag(session.language_b)}
                  </span>
                  <span className="font-medium">
                    {getLanguageName(session.language_b)}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              {/* Connection Status */}
              <ConnectionIndicator 
                websocketStatus={websocket.connectionState.status}
                dailyStatus={daily.callState}
                networkQuality={daily.networkQuality}
              />

              {/* Audio Controls */}
              <div className="flex items-center space-x-2">
                <Button
                  variant={daily.localAudio ? "default" : "outline"}
                  size="sm"
                  onClick={daily.toggleMicrophone}
                  disabled={daily.callState !== 'joined'}
                >
                  {daily.localAudio ? (
                    <Mic className="h-4 w-4" />
                  ) : (
                    <MicOff className="h-4 w-4" />
                  )}
                </Button>
              </div>

              {/* Users */}
              <div className="flex items-center space-x-2 text-sm text-gray-600">
                <Users className="h-4 w-4" />
                <span>{Object.keys(daily.participants || {}).length + 1} connected</span>
              </div>

              {/* Share Session */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(window.location.href)
                  toast.success('Session URL copied to clipboard!')
                }}
              >
                Share Session
              </Button>

              {/* Settings */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowSettings(!showSettings)}
              >
                <Settings className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Session Status */}
          <div className="lg:col-span-1">
            <SessionStatus session={session} />
          </div>

          {/* Translation Interface */}
          <div className="lg:col-span-3">
            <TranslationInterface 
              session={session}
              websocketConnection={websocket.connectionState}
              dailyConnection={daily}
            />
          </div>
        </div>
      </main>
    </div>
  )
}