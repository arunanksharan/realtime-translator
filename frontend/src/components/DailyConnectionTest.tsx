'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useSessionTokens } from '@/hooks/use-sessions'
import { Badge } from '@/components/ui/badge'

interface DailyConnectionTestProps {
  sessionId: string
}

export function DailyConnectionTest({ sessionId }: DailyConnectionTestProps) {
  const [testResult, setTestResult] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const { data: tokens, error: tokensError, isLoading: tokensLoading } = useSessionTokens(sessionId)

  const testDailyConnection = async () => {
    setIsLoading(true)
    setTestResult('Testing...')
    
    try {
      console.log('🧪 Testing Daily.co connection...')
      
      // 1. Check if tokens exist
      if (!tokens) {
        setTestResult('❌ No session tokens available')
        return
      }
      
      console.log('✅ Tokens available:', {
        room_url: tokens.room_url,
        has_token: !!tokens.token,
        token_preview: tokens.token?.substring(0, 20) + '...'
      })

      // 2. Test Daily.co SDK initialization
      const DailyIframe = (await import('@daily-co/daily-js')).default
      const testCall = DailyIframe.createCallObject()
      
      console.log('🎯 Testing actual Daily.co join...')
      
      const joinResult = await testCall.join({
        url: tokens.room_url,
        token: tokens.token,
      })
      
      console.log('✅ Daily.co join successful:', joinResult)
      setTestResult('✅ Daily.co connection successful!')
      
      // Clean up test call
      await testCall.leave()
      await testCall.destroy()
      
    } catch (error) {
      console.error('💥 Daily.co connection test failed:', error)
      setTestResult(`❌ Connection failed: ${error.message}`)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle className="text-sm">🧪 Daily.co Connection Test</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4 text-xs">
          <div className="flex justify-between">
            <span>Tokens Loading:</span>
            <Badge variant={tokensLoading ? "default" : "outline"}>
              {tokensLoading ? 'Loading...' : 'Done'}
            </Badge>
          </div>
          <div className="flex justify-between">
            <span>Tokens Available:</span>
            <Badge variant={tokens ? "default" : "destructive"}>
              {tokens ? '✅ Yes' : '❌ No'}
            </Badge>
          </div>
          <div className="flex justify-between">
            <span>Tokens Error:</span>
            <Badge variant={tokensError ? "destructive" : "default"}>
              {tokensError ? '❌ Yes' : '✅ No'}
            </Badge>
          </div>
          {tokens && (
            <>
              <div className="flex justify-between">
                <span>Room URL:</span>
                <Badge variant={tokens.room_url ? "default" : "destructive"}>
                  {tokens.room_url ? '✅ Yes' : '❌ No'}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span>Token Length:</span>
                <Badge variant="outline">
                  {tokens.token?.length || 0} chars
                </Badge>
              </div>
              <div className="flex justify-between">
                <span>User ID:</span>
                <Badge variant="outline">
                  {tokens.user_id || 'N/A'}
                </Badge>
              </div>
            </>
          )}
        </div>
        
        <Button 
          onClick={testDailyConnection} 
          disabled={!tokens || isLoading}
          size="sm"
          className="w-full"
        >
          {isLoading ? 'Testing...' : 'Test Daily.co Connection'}
        </Button>
        
        {testResult && (
          <div className="p-3 bg-gray-50 rounded-lg">
            <pre className="text-xs whitespace-pre-wrap">{testResult}</pre>
          </div>
        )}

        {tokensError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-xs text-red-800">
              <strong>Token Error:</strong> {tokensError.message}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
