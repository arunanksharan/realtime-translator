"""
WebSocket service for real-time session updates
"""
import asyncio
import json
import logging
from typing import Dict, Set, Any, Optional, List
from datetime import datetime
from fastapi import WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)

class WebSocketManager:
    """Manages WebSocket connections and broadcasts"""
    
    def __init__(self):
        # Store active connections by session ID
        self.connections: Dict[str, Set[WebSocket]] = {}
        self.connection_info: Dict[WebSocket, Dict[str, Any]] = {}
        
    async def connect(self, websocket: WebSocket, session_id: str, user_id: Optional[str] = None):
        """Connect client to session updates"""
        # DO NOT call websocket.accept() here - already done in main handler
        
        # Add to session connections
        if session_id not in self.connections:
            self.connections[session_id] = set()
        self.connections[session_id].add(websocket)
        
        # Store connection info
        self.connection_info[websocket] = {
            "session_id": session_id,
            "user_id": user_id,
            "connected_at": datetime.utcnow().isoformat(),
            "last_ping": datetime.utcnow().isoformat()
        }
        
        logger.info(f"WebSocket connected: session={session_id}, user={user_id}")
        
        # Broadcast participant joined event
        if user_id:
            await self.broadcast_to_session(session_id, {
                "type": "participant_joined",
                "data": {
                    "session_id": session_id,
                    "user_id": user_id,
                    "timestamp": datetime.utcnow().isoformat()
                }
            }, exclude_websocket=websocket)
        
    async def disconnect(self, websocket: WebSocket):
        """Disconnect client from session updates"""
        connection_info = self.connection_info.get(websocket)
        if not connection_info:
            return
            
        session_id = connection_info["session_id"]
        user_id = connection_info["user_id"]
        
        # Remove from session connections
        if session_id in self.connections:
            self.connections[session_id].discard(websocket)
            if not self.connections[session_id]:
                del self.connections[session_id]
        
        # Remove connection info
        del self.connection_info[websocket]
        
        logger.info(f"WebSocket disconnected: session={session_id}, user={user_id}")
        
        # Broadcast participant left event
        if user_id:
            await self.broadcast_to_session(session_id, {
                "type": "participant_left",
                "data": {
                    "session_id": session_id,
                    "user_id": user_id,
                    "timestamp": datetime.utcnow().isoformat()
                }
            })
            
    async def broadcast_to_session(
        self, 
        session_id: str, 
        message: Dict[str, Any], 
        exclude_websocket: Optional[WebSocket] = None
    ):
        """Broadcast message to all connections in a session"""
        if session_id not in self.connections:
            return
            
        # Add timestamp if not present
        if "timestamp" not in message:
            message["timestamp"] = datetime.utcnow().isoformat()
            
        dead_connections = set()
        
        for websocket in self.connections[session_id]:
            if websocket == exclude_websocket:
                continue
                
            try:
                await websocket.send_json(message)
            except Exception as e:
                logger.warning(f"Failed to send message to websocket: {e}")
                dead_connections.add(websocket)
        
        # Clean up dead connections
        for websocket in dead_connections:
            await self.disconnect(websocket)
            
    async def broadcast_transcription(
        self, 
        session_id: str, 
        speaker_id: str, 
        original_text: str, 
        translated_text: str, 
        language_from: str, 
        language_to: str,
        confidence: float = 0.0,
        is_partial: bool = False
    ):
        """Broadcast transcription update"""
        message = {
            "type": "transcription",
            "data": {
                "session_id": session_id,
                "speaker_id": speaker_id,
                "original_text": original_text,
                "translated_text": translated_text,
                "language_from": language_from,
                "language_to": language_to,
                "confidence": confidence,
                "is_partial": is_partial,
                "timestamp": datetime.utcnow().isoformat()
            }
        }
        
        await self.broadcast_to_session(session_id, message)
        
    async def broadcast_session_status(self, session_id: str, status: Dict[str, Any]):
        """Broadcast session status update"""
        message = {
            "type": "session_status",
            "data": status
        }
        
        await self.broadcast_to_session(session_id, message)
        
    async def broadcast_pipeline_status(self, session_id: str, pipeline_status: Dict[str, Any]):
        """Broadcast pipeline status update"""
        message = {
            "type": "pipeline_status",
            "data": pipeline_status
        }
        
        await self.broadcast_to_session(session_id, message)
        
    async def broadcast_error(self, session_id: str, error_code: str, error_message: str):
        """Broadcast error notification"""
        message = {
            "type": "error",
            "data": {
                "session_id": session_id,
                "error_code": error_code,
                "error_message": error_message,
                "timestamp": datetime.utcnow().isoformat()
            }
        }
        
        await self.broadcast_to_session(session_id, message)
        
    async def get_session_connections(self, session_id: str) -> int:
        """Get number of connections for a session"""
        return len(self.connections.get(session_id, set()))
        
    async def get_total_connections(self) -> int:
        """Get total number of active connections"""
        return sum(len(connections) for connections in self.connections.values())
        
    async def get_session_participants(self, session_id: str) -> List[Dict[str, Any]]:
        """Get list of participants in a session"""
        if session_id not in self.connections:
            return []
            
        participants = []
        for websocket in self.connections[session_id]:
            connection_info = self.connection_info.get(websocket)
            if connection_info and connection_info["user_id"]:
                participants.append({
                    "user_id": connection_info["user_id"],
                    "connected_at": connection_info["connected_at"],
                    "last_ping": connection_info["last_ping"]
                })
                
        return participants
        
    async def ping_connection(self, websocket: WebSocket):
        """Update last ping time for connection"""
        if websocket in self.connection_info:
            self.connection_info[websocket]["last_ping"] = datetime.utcnow().isoformat()
            
    async def cleanup_stale_connections(self):
        """Remove stale connections (called periodically)"""
        current_time = datetime.utcnow()
        stale_connections = []
        
        for websocket, info in self.connection_info.items():
            last_ping = datetime.fromisoformat(info["last_ping"])
            if (current_time - last_ping).total_seconds() > 300:  # 5 minutes
                stale_connections.append(websocket)
                
        for websocket in stale_connections:
            await self.disconnect(websocket)
            
        if stale_connections:
            logger.info(f"Cleaned up {len(stale_connections)} stale connections")

# Global WebSocket manager instance
websocket_manager = WebSocketManager()
