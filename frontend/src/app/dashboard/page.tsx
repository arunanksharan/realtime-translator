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
import { cn } from "@/lib/utils"

// Mock data for demonstration
const recentSessions = [
  {
    id: "1",
    name: "Spanish Conversation",
    participants: ["John Doe", "Maria Garcia"],
    languages: ["English", "Spanish"],
    status: "completed",
    duration: "45 min",
    createdAt: "2024-01-15T10:30:00Z",
  },
  {
    id: "2",
    name: "French Business Meeting",
    participants: ["Alice Johnson", "Pierre Martin"],
    languages: ["English", "French"],
    status: "completed",
    duration: "1h 20min",
    createdAt: "2024-01-14T14:15:00Z",
  },
  {
    id: "3",
    name: "Japanese Language Practice",
    participants: ["Bob Wilson", "Yuki Tanaka"],
    languages: ["English", "Japanese"],
    status: "active",
    duration: "12 min",
    createdAt: "2024-01-15T16:45:00Z",
  },
]

const stats = {
  totalSessions: 47,
  hoursTranslated: 234,
  languagesPaired: 12,
  accuracy: 96.5,
}

export default function DashboardPage() {
  const router = useRouter()
  const [showCreateDialog, setShowCreateDialog] = React.useState(false)
  const [isMuted, setIsMuted] = React.useState(false)
  const [isRecording, setIsRecording] = React.useState(false)

  const handleCreateSession = () => {
    setShowCreateDialog(true)
  }

  const handleCreateSessionSuccess = (sessionId: string) => {
    // ADD DEBUG LOGGING
    console.log('🎯 Dashboard received session ID:', sessionId)
    console.log('🚀 Navigating to session page...')
    
    // Navigate to the created session
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
      default:
        return "bg-gray-500"
    }
  }

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
            
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
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
                <p className="text-xs text-muted-foreground">+12 from last month</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Hours Translated</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.hoursTranslated}</div>
                <p className="text-xs text-muted-foreground">+23 from last month</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Languages Paired</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.languagesPaired}</div>
                <p className="text-xs text-muted-foreground">+2 from last month</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Accuracy</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.accuracy}%</div>
                <Progress value={stats.accuracy} className="mt-2" />
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Recent Sessions */}
        <div>
          <h2 className="text-xl font-semibold mb-4">Recent Sessions</h2>
          <div className="space-y-4">
            {recentSessions.map((session) => (
              <Card key={session.id} className="hover:shadow-md transition-shadow">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className={cn("w-3 h-3 rounded-full", getStatusColor(session.status))} />
                      <div>
                        <CardTitle className="text-base">{session.name}</CardTitle>
                        <CardDescription>
                          {session.participants.join(" & ")} • {session.languages.join(" ⇄ ")}
                        </CardDescription>
                      </div>
                    </div>
                    <div className="text-right">
                      <Badge variant={session.status === "active" ? "default" : "secondary"}>
                        {session.status}
                      </Badge>
                      <p className="text-xs text-muted-foreground mt-1">{session.duration}</p>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </main>

      {/* Create Session Dialog */}
      <CreateSessionDialog 
        open={showCreateDialog} 
        onOpenChange={setShowCreateDialog}
        onSuccess={handleCreateSessionSuccess}
      />
    </div>
  )
}
