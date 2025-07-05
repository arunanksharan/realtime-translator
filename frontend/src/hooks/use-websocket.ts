import { useEffect, useRef, useCallback, useState } from 'react'
import { toast } from 'sonner'
import { useSessionStore } from '@/stores/session'
import { WS_BASE_URL, WEBSOCKET_RECONNECT_INTERVAL } from '@/lib/constants'
import type { WebSocketMessage, TranscriptionMessage } from '@/types'

type TranscriptionData = TranscriptionMessage['data']

export function useWebSocket(sessionId: string | null) {
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const { 
    setWebsocketConnection, 
    websocketConnection,
    setSessionMetrics,
    setPipelineStatus 
  } = useSessionStore()

  // Enhanced state for real-time features
  const [transcriptions, setTranscriptions] = useState<TranscriptionData[]>([])
  const [participants, setParticipants] = useState<string[]>([])
  const [sessionStatus, setSessionStatus] = useState<string | null>(null)

  const connect = useCallback(() => {
    if (!sessionId) return

    try {
      setWebsocketConnection({ status: 'connecting' })
      
      const ws = new WebSocket(`${WS_BASE_URL}/${sessionId}`)
      wsRef.current = ws

      ws.onopen = () => {
        setWebsocketConnection({ 
          status: 'connected', 
          retryCount: 0,
          lastConnected: new Date().toISOString()
        })
        
        // Send initial ping
        ws.send('ping')
      }

      ws.onmessage = (event) => {
        try {
          // Handle pong response
          if (event.data === 'pong') {
            return
          }

          const message: WebSocketMessage = JSON.parse(event.data)
          
          switch (message.type) {
            case 'session_status':
              if (message.data?.pipeline_status) {
                setPipelineStatus(message.data.pipeline_status)
              }
              if (message.data?.status) {
                setSessionStatus(message.data.status)
              }
              if (message.data?.message) {
                toast.info(message.data.message)
              }
              break
              
            case 'session_metrics':
              if (message.data) {
                setSessionMetrics(message.data)
              }
              break

            case 'transcription':
              if (message.data) {
                setTranscriptions(prev => [...prev, message.data as TranscriptionData])
              }
              break

            case 'participant_joined':
              if (message.data?.user_id) {
                setParticipants(prev => [...prev, message.data.user_id])
                toast.success(`User ${message.data.user_id} joined the session`)
              }
              break

            case 'participant_left':
              if (message.data?.user_id) {
                setParticipants(prev => prev.filter(id => id !== message.data.user_id))
                toast.info(`User ${message.data.user_id} left the session`)
              }
              break

            case 'participants':
              if (message.data && Array.isArray(message.data)) {
                setParticipants(message.data.map(p => p.user_id || p))
              }
              break
              
            case 'error':
              console.error('WebSocket error:', message.error || message.data?.error_message)
              if (message.data?.error_message) {
                toast.error(message.data.error_message)
              }
              break

            default:
              console.log('Unknown WebSocket message type:', message.type)
          }
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error)
        }
      }

      ws.onclose = (event) => {
        setWebsocketConnection({ status: 'disconnected' })
        
        // Attempt to reconnect if not a clean close
        if (event.code !== 1000 && sessionId) {
          const currentRetryCount = websocketConnection.retryCount
          setWebsocketConnection({ retryCount: currentRetryCount + 1 })
          
          reconnectTimeoutRef.current = setTimeout(() => {
            connect()
          }, WEBSOCKET_RECONNECT_INTERVAL)
        }
      }

      ws.onerror = () => {
        setWebsocketConnection({ status: 'failed' })
      }

    } catch (error) {
      setWebsocketConnection({ status: 'failed' })
    }
  }, [sessionId, setWebsocketConnection, websocketConnection.retryCount, setSessionMetrics, setPipelineStatus])

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }
    
    if (wsRef.current) {
      wsRef.current.close(1000, 'User disconnect')
      wsRef.current = null
    }
    
    setWebsocketConnection({ status: 'disconnected', retryCount: 0 })
  }, [setWebsocketConnection])

  const sendMessage = useCallback((message: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(message)
    }
  }, [])

  const ping = useCallback(() => {
    sendMessage('ping')
  }, [sendMessage])

  const getStatus = useCallback(() => {
    sendMessage('get_status')
  }, [sendMessage])

  const getMetrics = useCallback(() => {
    sendMessage('get_metrics')
  }, [sendMessage])

  const getParticipants = useCallback(() => {
    sendMessage('get_participants')
  }, [sendMessage])

  const clearTranscriptions = useCallback(() => {
    setTranscriptions([])
  }, [])

  useEffect(() => {
    if (sessionId) {
      connect()
    }

    return () => {
      disconnect()
    }
  }, [sessionId, connect, disconnect])

  // Periodic ping to keep connection alive
  useEffect(() => {
    if (websocketConnection.status === 'connected') {
      const pingInterval = setInterval(() => {
        ping()
      }, 25000) // 25 seconds
      
      return () => clearInterval(pingInterval)
    }
  }, [websocketConnection.status, ping])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect()
    }
  }, [disconnect])

  return {
    connectionState: websocketConnection,
    transcriptions,
    participants,
    sessionStatus,
    sendMessage,
    ping,
    getStatus,
    getMetrics,
    getParticipants,
    clearTranscriptions,
    connect,
    disconnect,
  }
}