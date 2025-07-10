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
    if (!sessionId) {
      console.log('❌ useWebSocket: No sessionId provided')
      return
    }

    // Prevent multiple connections
    if (wsRef.current && wsRef.current.readyState === WebSocket.CONNECTING) {
      console.log('⏳ useWebSocket: Connection already in progress, skipping')
      return
    }

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      console.log('✅ useWebSocket: Already connected, skipping')
      return
    }

    console.log('🔗 useWebSocket: Attempting to connect to:', `${WS_BASE_URL}/${sessionId}`)

    try {
      setWebsocketConnection({ status: 'connecting' })
      
      const ws = new WebSocket(`${WS_BASE_URL}/${sessionId}`)
      wsRef.current = ws

      ws.onopen = () => {
        console.log('✅ useWebSocket: Connected successfully')
        setWebsocketConnection({ 
          status: 'connected', 
          retryCount: 0,
          lastConnected: new Date().toISOString()
        })
        
        // Send initial ping to verify connection
        ws.send('ping')
        console.log('🏓 useWebSocket: Sent initial ping')
      }

      ws.onmessage = (event) => {
        console.log('📨 useWebSocket: Received message:', event.data)
        
        // Handle pong response
        if (event.data === 'pong') {
          console.log('🏓 useWebSocket: Pong received - connection verified')
          return
        }

        try {
          const message: WebSocketMessage = JSON.parse(event.data)
          console.log('📋 useWebSocket: Parsed message:', message.type, message.data)
          
          switch (message.type) {
            case 'session_status':
              if (message.data?.pipeline_status) {
                setPipelineStatus(message.data.pipeline_status)
              }
              if (message.data?.status) {
                setSessionStatus(message.data.status)
              }
              if (message.data?.message) {
                console.log('💬 useWebSocket: Session message:', message.data.message)
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
              console.error('💥 useWebSocket: Server error:', message.error || message.data?.error_message)
              if (message.data?.error_message) {
                toast.error(message.data.error_message)
              }
              break

            default:
              console.log('❓ useWebSocket: Unknown message type:', message.type)
          }
        } catch (error) {
          console.error('💥 useWebSocket: Failed to parse message:', error, 'Raw data:', event.data)
        }
      }

      ws.onclose = (event) => {
        console.log('🔌 useWebSocket: Connection closed:', event.code, event.reason)
        setWebsocketConnection({ status: 'disconnected' })
        
        // Only attempt to reconnect if not a clean close and sessionId still exists
        if (event.code !== 1000 && sessionId && wsRef.current === ws) {
          const currentRetryCount = websocketConnection.retryCount || 0
          const retryDelay = Math.min(1000 * Math.pow(2, currentRetryCount), 30000)
          console.log(`🔄 useWebSocket: Retrying in ${retryDelay}ms (attempt ${currentRetryCount + 1})`)
          
          setWebsocketConnection({ retryCount: currentRetryCount + 1 })
          
          reconnectTimeoutRef.current = setTimeout(() => {
            // Double-check we still need to reconnect
            if (sessionId && (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED)) {
              connect()
            }
          }, retryDelay)
        }
      }

      ws.onerror = (error) => {
        console.error('💥 useWebSocket: Connection error:', error)
        setWebsocketConnection({ status: 'failed' })
      }

    } catch (error) {
      console.error('💥 useWebSocket: Failed to create connection:', error)
      setWebsocketConnection({ status: 'failed' })
    }
  }, [sessionId, setWebsocketConnection, setSessionMetrics, setPipelineStatus])

  const disconnect = useCallback(() => {
    console.log('🔌 useWebSocket: Disconnect called', {
      hasConnection: !!wsRef.current,
      readyState: wsRef.current?.readyState
    })

    if (reconnectTimeoutRef.current) {
      console.log('🔄 useWebSocket: Clearing reconnect timeout')
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }
    
    if (wsRef.current) {
      const ws = wsRef.current
      
      // Remove event listeners to prevent cleanup loops
      ws.onopen = null
      ws.onmessage = null
      ws.onclose = null
      ws.onerror = null
      
      // Close connection cleanly
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        console.log('🛑 useWebSocket: Closing connection')
        ws.close(1000, 'Component cleanup')
      }
      
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
    console.log('🎯 useWebSocket: Effect triggered', {
      hasSessionId: !!sessionId,
      sessionId: sessionId,
      wsBaseUrl: WS_BASE_URL,
      currentConnection: wsRef.current?.readyState
    })

    if (sessionId) {
      console.log('🔌 useWebSocket: Starting connection for session:', sessionId)
      connect()
    } else {
      console.log('⏳ useWebSocket: No sessionId provided, waiting...')
    }

    return () => {
      console.log('🧹 useWebSocket: Cleanup triggered for sessionId:', sessionId)
      // Only disconnect if we're actually cleaning up this specific session
      disconnect()
    }
  }, [sessionId]) // Removed connect and disconnect from dependencies to prevent loops

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