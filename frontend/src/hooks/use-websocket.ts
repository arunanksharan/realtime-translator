import { useEffect, useRef, useCallback } from 'react'
import { useSessionStore } from '@/stores/session'
import { WS_BASE_URL, WEBSOCKET_RECONNECT_INTERVAL } from '@/lib/constants'
import type { WebSocketMessage } from '@/types'

export function useWebSocket(sessionId: string | null) {
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const { 
    setWebsocketConnection, 
    websocketConnection,
    setSessionMetrics,
    setPipelineStatus 
  } = useSessionStore()

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
      }

      ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data)
          
          switch (message.type) {
            case 'session_status':
              if (message.data?.pipeline_status) {
                setPipelineStatus(message.data.pipeline_status)
              }
              break
              
            case 'session_metrics':
              if (message.data) {
                setSessionMetrics(message.data)
              }
              break
              
            case 'error':
              console.error('WebSocket error:', message.error)
              break
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

  useEffect(() => {
    if (sessionId) {
      connect()
    }

    return () => {
      disconnect()
    }
  }, [sessionId, connect, disconnect])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect()
    }
  }, [disconnect])

  return {
    connectionState: websocketConnection,
    sendMessage,
    ping,
    getStatus,
    getMetrics,
    connect,
    disconnect,
  }
}