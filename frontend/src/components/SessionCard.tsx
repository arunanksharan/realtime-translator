'use client'

import { useRouter } from 'next/navigation'
import { Play, Copy, Users, Clock, AlertCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { toast } from 'sonner'
import { formatDate, getLanguageName, getLanguageFlag } from '@/lib/utils'
import { SESSION_STATUS_COLORS, SESSION_STATUS_LABELS } from '@/lib/constants'
import type { TranslationSession } from '@/types'

interface SessionCardProps {
  session: TranslationSession
}

export function SessionCard({ session }: SessionCardProps) {
  const router = useRouter()

  const handleJoinSession = () => {
    router.push(`/session/${session.session_id}`)
  }

  const handleCopySessionId = () => {
    navigator.clipboard.writeText(session.session_id)
    toast.success('Session ID copied to clipboard')
  }

  const statusColor = SESSION_STATUS_COLORS[session.status] || SESSION_STATUS_COLORS.created
  const statusLabel = SESSION_STATUS_LABELS[session.status] || 'Unknown'

  const isActive = session.status === 'active'
  const canJoin = ['created', 'waiting', 'active'].includes(session.status)

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1 space-y-3">
            {/* Languages */}
            <div className="flex items-center space-x-4">
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

            {/* Status and Info */}
            <div className="flex items-center space-x-4 text-sm text-gray-600">
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${statusColor}`}>
                {isActive && <span className="w-2 h-2 bg-current rounded-full mr-1.5 animate-pulse" />}
                {statusLabel}
              </span>
              
              <div className="flex items-center space-x-1">
                <Clock className="h-4 w-4" />
                <span>{formatDate(session.created_at)}</span>
              </div>
              
              <div className="flex items-center space-x-1">
                <Users className="h-4 w-4" />
                <span>{session.user_b_id ? '2 users' : '1 user'}</span>
              </div>
            </div>

            {/* Session ID */}
            <div className="flex items-center space-x-2 text-sm">
              <span className="text-gray-500">ID:</span>
              <code className="px-2 py-1 bg-gray-100 rounded text-xs font-mono">
                {session.session_id.slice(0, 8)}...
              </code>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopySessionId}
                className="h-6 w-6 p-0"
              >
                <Copy className="h-3 w-3" />
              </Button>
            </div>

            {/* Error message */}
            {session.status === 'failed' && session.error_message && (
              <div className="flex items-start space-x-2 text-sm text-red-600 bg-red-50 p-2 rounded">
                <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>{session.error_message}</span>
              </div>
            )}

            {/* Waiting message */}
            {session.status === 'waiting' && (
              <div className="text-sm text-yellow-600 bg-yellow-50 p-2 rounded">
                Waiting for the other person to join...
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-col space-y-2 ml-4">
            {canJoin && (
              <Button
                onClick={handleJoinSession}
                variant={isActive ? "default" : "outline"}
                size="sm"
                className="whitespace-nowrap"
              >
                {isActive ? (
                  <>
                    <Play className="h-4 w-4 mr-1" />
                    Continue
                  </>
                ) : (
                  'Join'
                )}
              </Button>
            )}
            
            {session.status === 'completed' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleJoinSession}
                className="whitespace-nowrap text-gray-600"
              >
                View Details
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}