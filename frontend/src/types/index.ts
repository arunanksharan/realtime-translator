export interface User {
  id: string
  email: string
  username: string
  full_name?: string
  preferred_language?: string
  is_active: boolean
  is_verified: boolean
  created_at: string
  updated_at: string
}

export interface AuthTokens {
  access_token: string
  refresh_token: string
  token_type: string
  expires_in: number
  user_id: string
}

export interface LoginRequest {
  email: string
  password: string
}

export interface RegisterRequest {
  email: string
  username: string
  password: string
  full_name?: string
  preferred_language?: string
}

export interface AuthResponse {
  user: User
  tokens: AuthTokens
}

export type SessionStatus = 
  | 'created'
  | 'waiting' 
  | 'active'
  | 'completed'
  | 'failed'
  | 'expired'

export interface TranslationSession {
  session_id: string
  status: SessionStatus
  language_a: string
  language_b: string
  user_a_id: string
  user_b_id?: string
  room_url: string
  created_at: string
  started_at?: string
  ended_at?: string
  expires_at?: string
  error_message?: string
  pipeline_status?: PipelineStatus
}

export interface PipelineStatus {
  session_id: string
  is_running: boolean
  uptime_seconds?: number
  pipeline_a_to_b_status: PipelineDirectionStatus
  pipeline_b_to_a_status: PipelineDirectionStatus
  total_translations: number
}

export interface PipelineDirectionStatus {
  status: string
  direction: string
  transport_connected: boolean
  llm_service_ready: boolean
  translation_count: number
  last_translation_time_ms?: number
}

export interface CreateSessionRequest {
  language_a: string
  language_b: string
  user_b_id?: string
}

export interface JoinSessionRequest {
  session_id: string
}

export interface SessionTokens {
  room_url: string
  token: string
  user_id: string
  session_id: string
}

export interface SessionMetrics {
  session_id: string
  total_translations: number
  session_duration_ms: number
  avg_latency_ms?: number
  max_latency_ms?: number
  min_latency_ms?: number
  avg_confidence_score?: number
  error_count?: number
  reconnection_count?: number
  total_audio_duration_ms?: number
}

export interface SessionListResponse {
  sessions: TranslationSession[]
  total: number
}

export interface WebSocketMessage {
  type: 'session_status' | 'session_metrics' | 'error' | 'pong'
  data?: any
  error?: string
}

export interface HealthCheck {
  status: 'healthy' | 'unhealthy'
  service: string
  details?: {
    service_healthy: boolean
    active_sessions: number
    daily_service_healthy: boolean
    database_healthy: boolean
    pipeline_health: Record<string, any>
  }
}

export interface ServiceStats {
  total_sessions: number
  active_sessions: number
  status_counts: Record<string, number>
  is_running: boolean
  max_concurrent_sessions: number
}

export interface Language {
  code: string
  name: string
  flag: string
  rtl?: boolean
}

export interface AudioSettings {
  micEnabled: boolean
  speakerEnabled: boolean
  micVolume: number
  speakerVolume: number
  noiseReduction: boolean
  echoCancellation: boolean
}

export interface UIState {
  sidebarOpen: boolean
  darkMode: boolean
  compactMode: boolean
  showMetrics: boolean
  soundEnabled: boolean
}

export interface Translation {
  id: string
  session_id: string
  from_user_id: string
  to_user_id: string
  original_text: string
  translated_text: string
  original_language: string
  translated_language: string
  audio_duration?: number
  processing_time?: number
  confidence_score?: number
  created_at: string
}

export interface ConnectionState {
  status: 'disconnected' | 'connecting' | 'connected' | 'failed'
  error?: string
  retryCount: number
  lastConnected?: string
}

export interface DailyCallState {
  callState: 'idle' | 'joining' | 'joined' | 'left' | 'error'
  participants: Record<string, any>
  localAudio: boolean
  localVideo: boolean
  networkQuality: 'good' | 'warning' | 'bad' | 'unknown'
}
