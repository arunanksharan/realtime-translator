'use client'

import { useEffect } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Settings, Users, Mic, MicOff, Volume2, VolumeX, Share2, UserPlus, Loader2 } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { TranslationInterface } from '@/components/TranslationInterface'
import { SessionStatus } from '@/components/SessionStatus'
import { ConnectionIndicator } from '@/components/ConnectionIndicator'
import { AudioControlsCard } from '@/components/AudioControlsCard'
import { SessionSharingPanel } from '@/components/SessionSharingPanel'
import { DailyConnectionTest } from '@/components/DailyConnectionTest'
import { useAuthStore } from '@/stores/auth'
import { useSessionStore } from '@/stores/session'
import { useSession, useSessionTokens, usePublicSession, usePublicSessionWithToken, useJoinSession, useSessionPolling } from '@/hooks/use-sessions'
import { useWebSocket } from '@/hooks/use-websocket'
import { useDaily } from '@/hooks/use-daily'
import { formatDate, getLanguageName, getLanguageFlag } from '@/lib/utils'

export default function SessionPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const sessionId = params.sessionId as string
  const intendedRole = searchParams.get('role') // Check for role=userB
  const shareToken = searchParams.get('token') // Check for share token
  
  const { isAuthenticated, user } = useAuthStore()
  const currentUserId = user?.id
  const { 
    setCurrentSession, 
    currentSession, 
    dailyConnection,
    setShowSettings,
    showSettings 
  } = useSessionStore()

  // Fetch session data - use appropriate endpoint based on authentication and token
  const { data: session, isLoading: sessionLoading, error: sessionError } = shareToken
    ? usePublicSessionWithToken(sessionId, shareToken) // Use token-based access
    : isAuthenticated 
      ? useSession(sessionId) // Use authenticated access
      : usePublicSession(sessionId) // Use public access
  
  // Only fetch tokens if authenticated
  const { data: sessionTokens, error: tokensError } = useSessionTokens(
    isAuthenticated ? sessionId : null
  )

  // Add session polling
  const { session: polledSession } = useSessionPolling(
    sessionId,
    isAuthenticated && !!session // Only poll if authenticated and session exists
  )

  // Join session mutation for User B
  const joinSessionMutation = useJoinSession()

  // Enhanced debug logging for session loading
  useEffect(() => {
    console.log('🔍 Session Debug Info:', {
      sessionId,
      isAuthenticated,
      sessionLoading,
      hasSession: !!session,
      sessionError: sessionError?.message || sessionError?.response?.status,
      tokensError: tokensError?.message,
      hasTokens: !!sessionTokens,
      userRole: session ? (session.user_b_id ? 'existing_session' : 'needs_user_b') : 'unknown'
    })
  }, [sessionId, isAuthenticated, sessionLoading, session, sessionError, tokensError, sessionTokens])

  // Function to handle joining as User B
  const handleJoinAsUserB = async () => {
    if (!isAuthenticated) {
      // Preserve the token in the URL when redirecting to login
      const loginUrl = shareToken 
        ? `/auth/login?redirect=/session/${sessionId}?token=${encodeURIComponent(shareToken)}&role=userB`
        : `/auth/login?redirect=/session/${sessionId}?role=userB`
      
      toast.info('Please log in to join this session')
      router.push(loginUrl)
      return
    }

    if (!session) {
      toast.error('Session not found')
      return
    }

    if (session.user_b_id && session.user_b_id !== currentUserId) {
      toast.info('This session already has a second user')
      return
    }

    try {
      console.log('🚀 Attempting to join session as User B:', sessionId)
      await joinSessionMutation.mutateAsync(sessionId)
      
      // Refresh session data after joining
      window.location.reload()
    } catch (error) {
      console.error('❌ Failed to join session:', error)
    }
  }

  // RE-ENABLE WebSocket and Daily connections
  const websocket = useWebSocket(sessionId)
  const daily = useDaily(sessionTokens || null)

  useEffect(() => {
    // Allow unauthenticated users to view sessions via shared links
    // They can see the session but won't be able to join without auth
    if (!isAuthenticated) {
      console.log('User not authenticated - showing public session view')
    }
  }, [isAuthenticated, router])

  useEffect(() => {
    if (session) {
      setCurrentSession(session)
    }
  }, [session, setCurrentSession])
  
  // Merge polled data with existing session data
  useEffect(() => {
    if (polledSession && (!session || 
        (polledSession.updated_at && session.updated_at && 
         new Date(polledSession.updated_at) > new Date(session.updated_at)))) {
      setCurrentSession(polledSession)
    }
  }, [polledSession, session, setCurrentSession])

  // Don't block unauthenticated users - they can view public sessions
  // if (!isAuthenticated) {
  //   return null
  // }

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

  if (sessionError || !session) {
    const statusCode = sessionError?.response?.status
    const is404 = statusCode === 404
    const is401 = statusCode === 401
    const is403 = statusCode === 403
    const isNetworkError = sessionError?.code === 'ECONNABORTED' || sessionError?.code === 'NETWORK_ERROR'
    const isInvalidToken = is401 && shareToken
    
    console.error('🚨 Session Error Details:', {
      statusCode,
      error: sessionError,
      message: sessionError?.message,
      response: sessionError?.response?.data,
      hasToken: !!shareToken
    })
    
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center">
            <h2 className="text-xl font-semibold mb-2">
              {isInvalidToken ? 'Invalid or Expired Link' :
               is404 ? 'Session Not Found' : 
               is401 || is403 ? 'Access Denied' :
               'Connection Error'}
            </h2>
            <p className="text-gray-600 mb-4">
              {isInvalidToken
                ? "The share link is invalid or has expired. Please request a new link from the session owner."
                : is404 
                  ? "The translation session you're looking for doesn't exist or has expired."
                  : is401 || is403
                    ? "You don't have permission to access this session. Please log in or check your access."
                  : isNetworkError 
                    ? "Unable to connect to the server. Please check your internet connection."
                    : `An error occurred while loading the session. Please try again. ${statusCode ? `(Error ${statusCode})` : ''}`
              }
            </p>
            
            {/* Debug info in development */}
            {process.env.NODE_ENV === 'development' && sessionError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-left">
                <p className="text-xs text-red-800">
                  <strong>Debug Info:</strong><br/>
                  Status: {statusCode}<br/>
                  Message: {sessionError.message}<br/>
                  SessionId: {sessionId}<br/>
                  Authenticated: {isAuthenticated ? 'Yes' : 'No'}
                </p>
              </div>
            )}
            
            <div className="flex space-x-2">
              <Button 
                variant="outline" 
                onClick={() => {
                  console.log('🔄 Navigating to dashboard')
                  try {
                    router.push('/dashboard')
                  } catch (error) {
                    console.error('❌ Dashboard navigation failed:', error)
                    // Fallback to home page
                    router.push('/')
                  }
                }}
                className="flex-1"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Dashboard
              </Button>
              {!is404 && (
                <Button 
                  onClick={() => window.location.reload()}
                  className="flex-1"
                >
                  Try Again
                </Button>
              )}
            </div>
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
                onClick={() => {
                  console.log('🔄 Header: Navigating to dashboard')
                  try {
                    router.push('/dashboard')
                  } catch (error) {
                    console.error('❌ Header dashboard navigation failed:', error)
                    router.push('/')
                  }
                }}
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

              {/* Users - Show actual users, not Daily participants */}
              <div className="flex items-center space-x-2 text-sm text-gray-600">
                <Users className="h-4 w-4" />
                <span>
                  {session.user_b_id ? '2 users' : '1 user'} in session
                </span>
              </div>

              {/* Share Session - Only show for session owner */}
              {session && session.user_a_id === currentUserId && (
                <SessionSharingPanel session={session} />
              )}



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

      {/* Join Session Banner - Show for users who can join */}
      {session && !session.user_b_id && currentUserId !== session.user_a_id && (intendedRole === 'userB' || shareToken || session.is_token_access) && (
        <div className="bg-gradient-to-r from-blue-50 to-purple-50 border-t-4 border-blue-400">
          <div className="container mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="flex-shrink-0">
                  <Users className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    Translation Session Available
                  </h3>
                  <p className="text-sm text-gray-600">
                    {getLanguageName(session.language_a)} ⟷ {getLanguageName(session.language_b)} • 
                    Created {session.created_at ? formatDistanceToNow(new Date(session.created_at), { addSuffix: true }) : 'recently'}
                  </p>
                </div>
              </div>
              <div>
                {!isAuthenticated ? (
                  <Button
                    size="lg"
                    onClick={() => router.push('/auth/login')}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    Log in to Join
                  </Button>
                ) : (
                  <Button
                    size="lg"
                    onClick={handleJoinAsUserB}
                    disabled={joinSessionMutation.isPending}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    {joinSessionMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Joining...
                      </>
                    ) : (
                      <>
                        <UserPlus className="h-4 w-4 mr-2" />
                        Join Session
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Session Status */}
          <div className="lg:col-span-1 space-y-4">
            <SessionStatus session={session} />
            <AudioControlsCard daily={daily} />
            {/* Temporary debug component */}
            {process.env.NODE_ENV === 'development' && (
              <DailyConnectionTest sessionId={sessionId} />
            )}
          </div>

          {/* Translation Interface */}
          <div className="lg:col-span-3">
            <TranslationInterface 
              session={session}
              websocketConnection={websocket.connectionState}
              dailyConnection={daily}
              transcriptions={websocket.transcriptions}
              currentUserId={currentUserId || session.user_a_id} // Use actual current user
            />
          </div>
        </div>
      </main>
    </div>
  )
}