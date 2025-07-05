'use client'

import { useEffect, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { formatDate, getLanguageFlag, getLanguageName } from '@/lib/utils'
import { TranslationSession } from '@/types'

interface TranscriptionData {
  session_id: string
  speaker_id: string
  original_text: string
  translated_text: string
  language_from: string
  language_to: string
  confidence: number
  is_partial: boolean
  timestamp: string
}

interface TranscriptionFeedProps {
  transcriptions: TranscriptionData[]
  session: TranslationSession
  currentUserId?: string
  className?: string
}

export function TranscriptionFeed({ 
  transcriptions, 
  session, 
  currentUserId,
  className 
}: TranscriptionFeedProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new transcriptions arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [transcriptions])

  const getInitials = (userId: string) => {
    if (userId === session.user_a_id) return 'A'
    if (userId === session.user_b_id) return 'B'
    return userId.slice(0, 2).toUpperCase()
  }

  const getUserLabel = (userId: string) => {
    if (userId === currentUserId) return 'You'
    if (userId === session.user_a_id) return 'User A'
    if (userId === session.user_b_id) return 'User B'
    return `User ${userId.slice(0, 8)}`
  }

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-green-600'
    if (confidence >= 0.6) return 'text-yellow-600'
    return 'text-red-600'
  }

  if (transcriptions.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="text-lg">Live Translation</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
              <span className="text-2xl">🎤</span>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Start Speaking to See Translations
            </h3>
            <p className="text-gray-600 max-w-md">
              Once the translation session is active, your speech will be automatically 
              translated and displayed here in real-time.
            </p>
            <div className="flex items-center space-x-4 mt-6">
              <div className="flex items-center space-x-2">
                <span className="text-lg">{getLanguageFlag(session.language_a)}</span>
                <span className="text-sm font-medium">{getLanguageName(session.language_a)}</span>
              </div>
              <span className="text-gray-400">⇄</span>
              <div className="flex items-center space-x-2">
                <span className="text-lg">{getLanguageFlag(session.language_b)}</span>
                <span className="text-sm font-medium">{getLanguageName(session.language_b)}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Live Translation</CardTitle>
          <Badge variant="outline" className="text-xs">
            {transcriptions.length} messages
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-96" ref={scrollRef}>
          <div className="space-y-4">
            {transcriptions.map((transcription, index) => (
              <div key={index} className="space-y-3">
                <div className="flex items-start space-x-3">
                  <Avatar className="w-8 h-8">
                    <AvatarFallback className="text-xs">
                      {getInitials(transcription.speaker_id)}
                    </AvatarFallback>
                  </Avatar>
                  
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center space-x-2">
                      <span className="text-sm font-medium">
                        {getUserLabel(transcription.speaker_id)}
                      </span>
                      <Badge variant="secondary" className="text-xs">
                        {getLanguageName(transcription.language_from)}
                      </Badge>
                      <span className="text-xs text-gray-500">
                        {formatDate(new Date(transcription.timestamp))}
                      </span>
                      {transcription.confidence > 0 && (
                        <span className={`text-xs ${getConfidenceColor(transcription.confidence)}`}>
                          {Math.round(transcription.confidence * 100)}%
                        </span>
                      )}
                    </div>
                    
                    {/* Original Text */}
                    <div className="bg-gray-50 rounded-lg p-3">
                      <div className="flex items-center space-x-2 mb-1">
                        <span className="text-lg">{getLanguageFlag(transcription.language_from)}</span>
                        <span className="text-xs font-medium text-gray-600">Original</span>
                      </div>
                      <p className="text-sm text-gray-900">{transcription.original_text}</p>
                    </div>
                    
                    {/* Translated Text */}
                    <div className="bg-blue-50 rounded-lg p-3">
                      <div className="flex items-center space-x-2 mb-1">
                        <span className="text-lg">{getLanguageFlag(transcription.language_to)}</span>
                        <span className="text-xs font-medium text-blue-600">Translation</span>
                      </div>
                      <p className="text-sm text-blue-900 font-medium">{transcription.translated_text}</p>
                    </div>
                    
                    {transcription.is_partial && (
                      <Badge variant="outline" className="text-xs text-orange-600">
                        Partial
                      </Badge>
                    )}
                  </div>
                </div>
                
                {index < transcriptions.length - 1 && (
                  <Separator className="my-4" />
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  )
}
