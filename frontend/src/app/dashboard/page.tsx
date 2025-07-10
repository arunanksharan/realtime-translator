"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Plus, Settings, History, Users, Mic, MicOff, Volume2, VolumeX } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Progress } from "@/components/ui/progress"
import { Spinner } from "@/components/ui/spinner"
import { ThemeToggle } from "@/components/theme-toggle"
import { CreateSessionDialog } from "@/components/CreateSessionDialog"
import { JoinSessionDialog } from "@/components/JoinSessionDialog"
import { SessionListDialog } from "@/components/SessionListDialog"
import { cn, getLanguageName } from "@/lib/utils"
import { useSessions } from "@/hooks/use-sessions"
import { formatDistanceToNow } from "date-fns"
import { monitoringApi } from "@/lib/api"
import { useQuery } from "@tanstack/react-query"

export default function DashboardPage() {
  const router = useRouter()
  const [showCreateDialog, setShowCreateDialog] = React.useState(false)
  const [showSessionList, setShowSessionList] = React.useState(false)
  const [isMuted, setIsMuted] = React.useState(false)
  const [isRecording, setIsRecording] = React.useState(false)

  // Fetch real session data
  const { data: sessionsData, isLoading: sessionsLoading } = useSessions(10)
  const { data: serviceStats } = useQuery({
    queryKey: ['service-stats'],
    queryFn: monitoringApi.stats,
    refetchInterval: 60000, // Refresh every minute
  })

  const handleCreateSession = () => {
    setShowCreateDialog(true)
  }

  const handleCreateSessionSuccess = (sessionId: string) => {
    console.log('🎯 Dashboard received session ID:', sessionId)
    console.log('🚀 Navigating to session page...')
    
    // Navigate to the created session
    router.push(`/session/${sessionId}`)
  }

  const handleSessionClick = (sessionId: string) => {
    router.push(`/session/${sessionId}`)
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-500"
      case "completed":
        return "bg-blue-500"
      case "failed":
        return "bg-red-500"
      case "waiting":
        return "bg-yellow-500"
      case "created":
        return "bg-purple-500"
      default:
        return "bg-gray-500"
    }
  }

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case "active":
        return "default"
      case "waiting":
      case "created":
        return "secondary"
      default:
        return "outline"
    }
  }

  // Calculate stats from real data
  const stats = React.useMemo(() => {
    if (!sessionsData?.sessions || !serviceStats) {
      return {
        totalSessions: 0,
        activeSessions: 0,
        completedSessions: 0,
        uniqueLanguages: 0,
      }
    }

    const sessions = sessionsData.sessions
    const languagesSet = new Set<string>()
    sessions.forEach(session => {
      languagesSet.add(session.language_a)
      languagesSet.add(session.language_b)
    })

    return {
      totalSessions: serviceStats.total_sessions || sessions.length,
      activeSessions: serviceStats.active_sessions || sessions.filter(s => s.status === 'active').length,
      completedSessions: sessions.filter(s => s.status === 'completed').length,
      uniqueLanguages: languagesSet.size,
    }
  }, [sessionsData, serviceStats])

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <h1 className="text-2xl font-bold">Realtime Translator</h1>
              <Badge variant="secondary">Beta</Badge>
            </div>
            <div className="flex items-center space-x-4">
              <Button 
                variant="outline" 
                size="icon" 
                onClick={() => setIsMuted(!isMuted)}
                title={isMuted ? "Unmute" : "Mute"}
              >
                {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </Button>
              <Button 
                variant="outline" 
                size="icon" 
                onClick={() => setIsRecording(!isRecording)}
                title={isRecording ? "Stop Recording" : "Start Recording"}
              >
                {isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </Button>
              <ThemeToggle />
              <Avatar>
                <AvatarImage src="/placeholder-avatar.svg" alt="User" />
                <AvatarFallback>JD</AvatarFallback>
              </Avatar>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {/* Quick Actions */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Quick Actions</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={handleCreateSession}>
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center space-x-2">
                  <Plus className="h-5 w-5" />
                  <span>New Session</span>
                </CardTitle>
                <CardDescription>Start a new translation session</CardDescription>
              </CardHeader>
            </Card>
            
            <JoinSessionDialog />
            
            <Card 
              className="hover:shadow-md transition-shadow cursor-pointer" 
              onClick={() => setShowSessionList(true)}
            >
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center space-x-2">
                  <History className="h-5 w-5" />
                  <span>Recent Sessions</span>
                </CardTitle>
                <CardDescription>View your translation history</CardDescription>
              </CardHeader>
            </Card>
            
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center space-x-2">
                  <Settings className="h-5 w-5" />
                  <span>Settings</span>
                </CardTitle>
                <CardDescription>Configure your preferences</CardDescription>
              </CardHeader>
            </Card>
          </div>
        </div>

        {/* Statistics */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-4">Your Statistics</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Total Sessions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.totalSessions}</div>
                <p className="text-xs text-muted-foreground">All time</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Active Sessions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.activeSessions}</div>
                <p className="text-xs text-muted-foreground">Currently running</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Completed</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.completedSessions}</div>
                <p className="text-xs text-muted-foreground">Successfully finished</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Languages Used</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.uniqueLanguages}</div>
                <p className="text-xs text-muted-foreground">Unique languages</p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Recent Sessions */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Recent Sessions</h2>
            {sessionsData && sessionsData.sessions.length > 3 && (
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => setShowSessionList(true)}
              >
                View all
              </Button>
            )}
          </div>
          
          {sessionsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Spinner className="h-6 w-6" />
            </div>
          ) : sessionsData?.sessions && sessionsData.sessions.length > 0 ? (
            <div className="space-y-4">
              {sessionsData.sessions.slice(0, 3).map((session) => {
                const sessionName = `${getLanguageName(session.language_a)} ⟷ ${getLanguageName(session.language_b)}`
                const timeAgo = session.created_at ? formatDistanceToNow(new Date(session.created_at), { addSuffix: true }) : 'Unknown'
                
                return (
                  <Card 
                    key={session.session_id} 
                    className="hover:shadow-md transition-shadow cursor-pointer"
                    onClick={() => handleSessionClick(session.session_id)}
                  >
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className={cn("w-3 h-3 rounded-full", getStatusColor(session.status))} />
                          <div>
                            <CardTitle className="text-base">{sessionName}</CardTitle>
                            <CardDescription>
                              Created {timeAgo}
                              {session.user_b_id ? ' • 2 participants' : ' • Waiting for participant'}
                            </CardDescription>
                          </div>
                        </div>
                        <div className="text-right">
                          <Badge variant={getStatusBadgeVariant(session.status)}>
                            {session.status}
                          </Badge>
                          {session.started_at && session.ended_at && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {formatDistanceToNow(new Date(session.started_at), { addSuffix: false })}
                            </p>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                  </Card>
                )
              })}
            </div>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-8">
                <p className="text-muted-foreground mb-4">No sessions yet</p>
                <Button onClick={handleCreateSession}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create your first session
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </main>

      {/* Create Session Dialog */}
      <CreateSessionDialog 
        open={showCreateDialog} 
        onOpenChange={setShowCreateDialog}
        onSuccess={handleCreateSessionSuccess}
      />
      
      {/* Session List Dialog */}
      <SessionListDialog
        open={showSessionList}
        onOpenChange={setShowSessionList}
        onSelectSession={handleSessionClick}
      />
    </div>
  )
}
