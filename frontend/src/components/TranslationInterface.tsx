'use client'

import { useEffect, useRef } from 'react'
import { Mic, MicOff, Volume2, VolumeX } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useSessionStore } from '@/stores/session'
import { getLanguageName, getLanguageFlag, formatDate } from '@/lib/utils'
import type { TranslationSession, ConnectionState } from '@/types'

interface TranslationInterfaceProps {
  session: TranslationSession
  websocketConnection: ConnectionState
  dailyConnection: any // From useDaily hook
}

export function TranslationInterface({
  session,
  websocketConnection,
  dailyConnection
}: TranslationInterfaceProps) {
  const { translations, isTranslating } = useSessionStore()
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [translations])

  const isConnected = websocketConnection.status === 'connected' && 
                     dailyConnection.callState === 'joined'

  return (
    <div className="space-y-6">
      {/* Audio Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Translation Active</span>
            {isTranslating && (
              <div className="flex items-center space-x-2">
                <div className="audio-visualizer">
                  <div className="audio-bar"></div>
                  <div className="audio-bar"></div>
                  <div className="audio-bar"></div>
                  <div className="audio-bar"></div>
                  <div className="audio-bar"></div>
                </div>
                <span className="text-sm text-green-600">Listening...</span>
              </div>
            )}
          </CardTitle>
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
              </div>
            </div>
          </div>

          {!isConnected && (
            <div className="mt-4 p-4 bg-yellow-50 rounded-lg text-center">
              <p className="text-sm text-yellow-800">
                {websocketConnection.status !== 'connected' 
                  ? 'Connecting to translation service...'
                  : 'Connecting to audio...'}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Translation History */}
      <Card className="flex-1">
        <CardHeader>
          <CardTitle>Translation History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-96 overflow-y-auto scrollbar-thin space-y-4 p-4 bg-gray-50 rounded-lg">
            {translations.length === 0 ? (
              <div className="text-center text-gray-500 py-12">
                <Mic className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p className="text-lg font-medium mb-2">Ready to translate</p>
                <p className="text-sm">
                  Start speaking and see your translations appear here
                </p>
              </div>
            ) : (
              translations.map((translation, index) => (
                <div
                  key={translation.id}
                  className={`translation-bubble ${
                    translation.from_user_id === session.user_a_id ? 'user-a' : 'user-b'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs opacity-75">
                        {getLanguageName(translation.original_language)}
                      </span>
                      <span className="text-xs opacity-75">
                        {formatDate(translation.created_at)}
                      </span>
                    </div>
                    <div className="font-medium">
                      {translation.original_text}
                    </div>
                    <div className="border-t border-current/20 pt-2">
                      <div className="text-xs opacity-75 mb-1">
                        → {getLanguageName(translation.translated_language)}
                      </div>
                      <div className="italic">
                        {translation.translated_text}
                      </div>
                    </div>
                    {translation.confidence_score && (
                      <div className="text-xs opacity-75">
                        Confidence: {translation.confidence_score}%
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>
        </CardContent>
      </Card>

      {/* Help Text */}
      {session.status === 'active' && isConnected && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-4 text-sm text-gray-600">
              <div className="flex items-center space-x-2">
                <Mic className="h-4 w-4" />
                <span>Speak clearly into your microphone</span>
              </div>
              <div className="flex items-center space-x-2">
                <Volume2 className="h-4 w-4" />
                <span>Listen to translations through your speakers</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}