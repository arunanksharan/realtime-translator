'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Clock, Languages, Users, Play, UserPlus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from '@/components/ui/dialog'
import { useSessions, useJoinSession } from '@/hooks/use-sessions'
import { formatDate, getLanguageName, getLanguageFlag } from '@/lib/utils'

export function SessionListDialog() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const { data: sessionsData, isLoading } = useSessions(20)
  const joinMutation = useJoinSession()

  const handleJoinSession = (sessionId: string) => {
    joinMutation.mutate(sessionId, {
      onSuccess: () => {
        setOpen(false)
        router.push(`/session/${sessionId}`)
      },
    })
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-500'
      case 'waiting':
        return 'bg-yellow-500'
      case 'completed':
        return 'bg-blue-500'
      case 'failed':
        return 'bg-red-500'
      default:
        return 'bg-gray-500'
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'active':
        return 'Active'
      case 'waiting':
        return 'Waiting'
      case 'completed':
        return 'Completed'
      case 'failed':
        return 'Failed'
      default:
        return 'Unknown'
    }
  }

  const canJoinSession = (session: any) => {
    return session.status === 'waiting' || session.status === 'created'
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Card className="hover:shadow-md transition-shadow cursor-pointer">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center space-x-2">
              <Users className="h-5 w-5" />
              <span>Available Sessions</span>
            </CardTitle>
          </CardHeader>
        </Card>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Available Translation Sessions</DialogTitle>
        </DialogHeader>
        
        <div className="max-h-96 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : !sessionsData?.sessions?.length ? (
            <div className="text-center py-8 text-gray-500">
              No sessions available to join
            </div>
          ) : (
            <div className="space-y-4">
              {sessionsData.sessions.map((session) => (
                <Card key={session.session_id} className="hover:shadow-sm transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className={`w-3 h-3 rounded-full ${getStatusColor(session.status)}`} />
                        <div>
                          <div className="flex items-center space-x-2 mb-1">
                            <span className="language-flag">
                              {getLanguageFlag(session.language_a)}
                            </span>
                            <span className="text-sm font-medium">
                              {getLanguageName(session.language_a)}
                            </span>
                            <span className="text-gray-400">⟷</span>
                            <span className="language-flag">
                              {getLanguageFlag(session.language_b)}
                            </span>
                            <span className="text-sm font-medium">
                              {getLanguageName(session.language_b)}
                            </span>
                          </div>
                          <div className="flex items-center space-x-4 text-xs text-gray-500">
                            <span className="flex items-center space-x-1">
                              <Clock className="h-3 w-3" />
                              <span>{formatDate(session.created_at)}</span>
                            </span>
                            <span className="flex items-center space-x-1">
                              <Users className="h-3 w-3" />
                              <span>{session.participants?.length || 0} joined</span>
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Badge variant={session.status === 'active' ? 'default' : 'secondary'}>
                          {getStatusLabel(session.status)}
                        </Badge>
                        {canJoinSession(session) && (
                          <Button
                            size="sm"
                            onClick={() => handleJoinSession(session.session_id)}
                            disabled={joinMutation.isPending}
                          >
                            <UserPlus className="h-4 w-4 mr-1" />
                            Join
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// Export a simple trigger component for the dashboard
export function SessionListTrigger() {
  return (
    <SessionListDialog />
  )
}
