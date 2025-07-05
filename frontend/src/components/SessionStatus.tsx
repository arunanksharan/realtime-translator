'use client'

import { Users, Clock, AlertCircle, CheckCircle, Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useStartSession, useStopSession } from '@/hooks/use-sessions'
import { useSessionStore } from '@/stores/session'
import { formatDate } from '@/lib/utils'
import { SESSION_STATUS_COLORS, SESSION_STATUS_LABELS } from '@/lib/constants'
import type { TranslationSession } from '@/types'

interface SessionStatusProps {
  session: TranslationSession
}

export function SessionStatus({ session }: SessionStatusProps) {
  const { isTranslating } = useSessionStore()
  const startMutation = useStartSession()
  const stopMutation = useStopSession()

  const statusColor = SESSION_STATUS_COLORS[session.status]
  const statusLabel = SESSION_STATUS_LABELS[session.status]

  const canStart = session.status === 'waiting' && session.user_b_id
  const canStop = session.status === 'active'

  const handleStart = () => {
    startMutation.mutate(session.session_id)
  }

  const handleStop = () => {
    stopMutation.mutate(session.session_id)
  }

  return (
    <div className="space-y-6">
      {/* Session Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Session Info</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Status</span>
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${statusColor}`}>
              {session.status === 'active' && (
                <span className="w-2 h-2 bg-current rounded-full mr-1.5 animate-pulse" />
              )}
              {statusLabel}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Created</span>
            <span className="text-sm">{formatDate(session.created_at)}</span>
          </div>

          {session.started_at && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Started</span>
              <span className="text-sm">{formatDate(session.started_at)}</span>
            </div>
          )}

          {session.ended_at && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Ended</span>
              <span className="text-sm">{formatDate(session.ended_at)}</span>
            </div>
          )}

          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Session ID</span>
            <code className="text-xs bg-gray-100 px-2 py-1 rounded">
              {session.session_id.slice(0, 8)}...
            </code>
          </div>
        </CardContent>
      </Card>

      {/* Users */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center space-x-2">
            <Users className="h-5 w-5" />
            <span>Participants</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm">User A</span>
            <div className="flex items-center space-x-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span className="text-sm text-gray-600">Connected</span>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm">User B</span>
            <div className="flex items-center space-x-2">
              {session.user_b_id ? (
                <>
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span className="text-sm text-gray-600">Connected</span>
                </>
              ) : (
                <>
                  <Clock className="h-4 w-4 text-yellow-500" />
                  <span className="text-sm text-gray-600">Waiting...</span>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Controls</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {canStart && (
            <Button 
              className="w-full" 
              onClick={handleStart}
              disabled={startMutation.isPending}
            >
              {startMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Starting...
                </>
              ) : (
                'Start Translation'
              )}
            </Button>
          )}

          {canStop && (
            <Button 
              variant="destructive" 
              className="w-full" 
              onClick={handleStop}
              disabled={stopMutation.isPending}
            >
              {stopMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Stopping...
                </>
              ) : (
                'Stop Translation'
              )}
            </Button>
          )}

          {session.status === 'created' && !session.user_b_id && (
            <div className="text-center p-4 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-800 mb-2">
                Share this session with someone else to start translating
              </p>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(window.location.href)
                  // Toast would be shown by the copy action
                }}
              >
                Copy Link
              </Button>
            </div>
          )}

          {session.status === 'waiting' && (
            <div className="text-center p-4 bg-yellow-50 rounded-lg">
              <Clock className="h-8 w-8 text-yellow-600 mx-auto mb-2" />
              <p className="text-sm text-yellow-800">
                Waiting for the other person to join...
              </p>
            </div>
          )}

          {session.status === 'failed' && session.error_message && (
            <div className="p-4 bg-red-50 rounded-lg">
              <div className="flex items-start space-x-2">
                <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-red-800">Translation Failed</p>
                  <p className="text-sm text-red-600 mt-1">{session.error_message}</p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}