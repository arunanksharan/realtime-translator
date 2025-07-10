'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Clock, Languages, Users, Play, UserPlus, ExternalLink } from 'lucide-react'

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
import { ScrollArea } from '@/components/ui/scroll-area'
import { useSessions, useJoinSession } from '@/hooks/use-sessions'
import { formatDate, getLanguageName, getLanguageFlag } from '@/lib/utils'
import { formatDistanceToNow } from 'date-fns'

interface SessionListDialogProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onSelectSession?: (sessionId: string) => void
  showTrigger?: boolean
}

export function SessionListDialog({ 
  open: controlledOpen, 
  onOpenChange: controlledOnOpenChange,
  onSelectSession,
  showTrigger = false 
}: SessionListDialogProps = {}) {
  const router = useRouter()
  const [internalOpen, setInternalOpen] = useState(false)
  const { data: sessionsData, isLoading } = useSessions(50)
  const joinMutation = useJoinSession()
  
  // Use controlled state if provided, otherwise use internal state
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen
  const setOpen = controlledOnOpenChange || setInternalOpen

  const handleJoinSession = (sessionId: string) => {
    joinMutation.mutate(sessionId, {
      onSuccess: () => {
        setOpen(false)
        router.push(`/session/${sessionId}`)
      },
    })
  }
  
  const handleSelectSession = (sessionId: string) => {
    if (onSelectSession) {
      onSelectSession(sessionId)
      setOpen(false)
    } else {
      router.push(`/session/${sessionId}`)
    }
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

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'active':
        return 'default' as const
      case 'waiting':
      case 'created':
        return 'secondary' as const
      case 'completed':
        return 'outline' as const
      default:
        return 'destructive' as const
    }
  }

  const dialogContent = (
    <>
      <DialogHeader>
        <DialogTitle>Your Translation Sessions</DialogTitle>
      </DialogHeader>
      
      <ScrollArea className="h-[400px] pr-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : !sessionsData?.sessions?.length ? (
          <div className="text-center py-8 text-gray-500">
            No sessions found
          </div>
        ) : (
          <div className="space-y-3">
            {sessionsData.sessions.map((session) => {
              const timeAgo = session.created_at 
                ? formatDistanceToNow(new Date(session.created_at), { addSuffix: true })
                : 'Unknown'
              
              return (
                <Card 
                  key={session.session_id} 
                  className="hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => handleSelectSession(session.session_id)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-2">
                          <div className={`w-2 h-2 rounded-full ${getStatusColor(session.status)}`} />
                          <span className="language-flag text-sm">
                            {getLanguageFlag(session.language_a)}
                          </span>
                          <span className="text-sm font-medium">
                            {getLanguageName(session.language_a)}
                          </span>
                          <span className="text-gray-400 text-sm">⟷</span>
                          <span className="language-flag text-sm">
                            {getLanguageFlag(session.language_b)}
                          </span>
                          <span className="text-sm font-medium">
                            {getLanguageName(session.language_b)}
                          </span>
                        </div>
                        <div className="flex items-center space-x-4 text-xs text-muted-foreground">
                          <span className="flex items-center space-x-1">
                            <Clock className="h-3 w-3" />
                            <span>{timeAgo}</span>
                          </span>
                          <span className="flex items-center space-x-1">
                            <Users className="h-3 w-3" />
                            <span>{session.user_b_id ? '2 participants' : 'Waiting for participant'}</span>
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Badge variant={getStatusBadgeVariant(session.status)}>
                          {getStatusLabel(session.status)}
                        </Badge>
                        {session.status === 'created' && !session.user_b_id && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleJoinSession(session.session_id)
                            }}
                            disabled={joinMutation.isPending}
                          >
                            <UserPlus className="h-3 w-3 mr-1" />
                            Join
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleSelectSession(session.session_id)
                          }}
                        >
                          <ExternalLink className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </ScrollArea>
    </>
  )

  if (showTrigger) {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center space-x-2">
                <Users className="h-5 w-5" />
                <span>Session History</span>
              </CardTitle>
            </CardHeader>
          </Card>
        </DialogTrigger>
        <DialogContent className="sm:max-w-2xl">
          {dialogContent}
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-2xl">
        {dialogContent}
      </DialogContent>
    </Dialog>
  )
}

// Export a simple trigger component for the dashboard
export function SessionListTrigger() {
  return <SessionListDialog showTrigger={true} />
}
