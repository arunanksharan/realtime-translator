"""
Daily.co WebRTC service for managing rooms and tokens
"""
import httpx
import json
from typing import Dict, Any, Optional
from datetime import datetime, timedelta
from app.core.config import settings
import logging

logger = logging.getLogger(__name__)

class DailyService:
    """Service for managing Daily.co rooms and tokens"""
    
    def __init__(self):
        self.api_key = settings.daily_api_key
        self.domain = settings.daily_domain
        self.base_url = f"https://api.daily.co/v1"
        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
    
    async def create_room(self, name: str, properties: Dict[str, Any]) -> Dict[str, Any]:
        """Create a new Daily.co room"""
        
        room_config = {
            "name": name,
            "properties": {
                "max_participants": properties.get("max_participants", 4),
                "exp": properties.get("exp", int((datetime.now() + timedelta(hours=2)).timestamp())),
                "enable_screenshare": properties.get("enable_screenshare", False),
                "enable_chat": properties.get("enable_chat", False),
                "start_audio_off": properties.get("start_audio_off", False),
                "start_video_off": properties.get("start_video_off", True),
                "enable_recording": properties.get("enable_recording", False),
                "enable_network_ui": properties.get("enable_network_ui", False),
                "enable_prejoin_ui": properties.get("enable_prejoin_ui", False),
                "lang": properties.get("lang", "en"),
                "autojoin": properties.get("autojoin", True),
                **properties
            }
        }
        
        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(
                    f"{self.base_url}/rooms",
                    headers=self.headers,
                    json=room_config,
                    timeout=30.0
                )
                response.raise_for_status()
                
                room_data = response.json()
                logger.info(f"Created Daily.co room: {room_data['name']}")
                return room_data
                
            except httpx.HTTPError as e:
                logger.error(f"Failed to create Daily.co room: {e}")
                raise Exception(f"Failed to create room: {str(e)}")
    
    async def get_room(self, room_name: str) -> Optional[Dict[str, Any]]:
        """Get room information"""
        
        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(
                    f"{self.base_url}/rooms/{room_name}",
                    headers=self.headers,
                    timeout=30.0
                )
                
                if response.status_code == 404:
                    return None
                    
                response.raise_for_status()
                return response.json()
                
            except httpx.HTTPError as e:
                logger.error(f"Failed to get room {room_name}: {e}")
                return None
    
    async def delete_room(self, room_name: str) -> bool:
        """Delete a Daily.co room"""
        
        async with httpx.AsyncClient() as client:
            try:
                response = await client.delete(
                    f"{self.base_url}/rooms/{room_name}",
                    headers=self.headers,
                    timeout=30.0
                )
                
                if response.status_code == 404:
                    logger.warning(f"Room {room_name} not found for deletion")
                    return True
                    
                response.raise_for_status()
                logger.info(f"Deleted Daily.co room: {room_name}")
                return True
                
            except httpx.HTTPError as e:
                logger.error(f"Failed to delete room {room_name}: {e}")
                return False
    
    async def create_token(
        self, 
        room_name: str, 
        user_name: str, 
        is_owner: bool = False,
        exp_time: int = 3600,
        properties: Optional[Dict[str, Any]] = None
    ) -> str:
        """Create a room access token"""
        
        # Calculate expiration timestamp
        exp_timestamp = int(datetime.now().timestamp()) + exp_time
        
        token_config = {
            "properties": {
                "room_name": room_name,
                "user_name": user_name,
                "is_owner": is_owner,
                "exp": exp_timestamp,
                **(properties or {})
            }
        }
        
        logger.info(f"🎫 Creating token for user {user_name} in room {room_name}")
        logger.debug(f"🔧 Token config: {token_config}")
        
        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(
                    f"{self.base_url}/meeting-tokens",
                    headers=self.headers,
                    json=token_config,
                    timeout=30.0
                )
                
                if response.status_code != 200:
                    logger.error(f"❌ Daily.co API error: {response.status_code}")
                    logger.error(f"📋 Response body: {response.text}")
                    
                response.raise_for_status()
                
                token_data = response.json()
                logger.info(f"✅ Created token for user {user_name} in room {room_name}")
                return token_data["token"]
                
            except httpx.HTTPError as e:
                logger.error(f"❌ Failed to create token for {user_name}: {e}")
                if hasattr(e, 'response') and e.response:
                    logger.error(f"📋 Response status: {e.response.status_code}")
                    logger.error(f"📋 Response body: {e.response.text}")
                raise Exception(f"Failed to create token: {str(e)}")
    
    async def get_room_participants(self, room_name: str) -> Dict[str, Any]:
        """Get current participants in a room"""
        
        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(
                    f"{self.base_url}/rooms/{room_name}/participants",
                    headers=self.headers,
                    timeout=30.0
                )
                response.raise_for_status()
                
                return response.json()
                
            except httpx.HTTPError as e:
                logger.error(f"Failed to get participants for room {room_name}: {e}")
                return {"participants": []}
    
    async def eject_participant(self, room_name: str, participant_id: str) -> bool:
        """Eject a participant from a room"""
        
        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(
                    f"{self.base_url}/rooms/{room_name}/eject",
                    headers=self.headers,
                    json={"participant_id": participant_id},
                    timeout=30.0
                )
                response.raise_for_status()
                
                logger.info(f"Ejected participant {participant_id} from room {room_name}")
                return True
                
            except httpx.HTTPError as e:
                logger.error(f"Failed to eject participant {participant_id}: {e}")
                return False
    
    async def update_room_config(self, room_name: str, config: Dict[str, Any]) -> bool:
        """Update room configuration"""
        
        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(
                    f"{self.base_url}/rooms/{room_name}",
                    headers=self.headers,
                    json={"properties": config},
                    timeout=30.0
                )
                response.raise_for_status()
                
                logger.info(f"Updated config for room {room_name}")
                return True
                
            except httpx.HTTPError as e:
                logger.error(f"Failed to update room config {room_name}: {e}")
                return False
    
    async def get_room_stats(self, room_name: str) -> Dict[str, Any]:
        """Get room statistics"""
        
        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(
                    f"{self.base_url}/rooms/{room_name}/stats",
                    headers=self.headers,
                    timeout=30.0
                )
                response.raise_for_status()
                
                return response.json()
                
            except httpx.HTTPError as e:
                logger.error(f"Failed to get stats for room {room_name}: {e}")
                return {}
    
    async def health_check(self) -> bool:
        """Check if Daily.co API is accessible"""
        
        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(
                    f"{self.base_url}/",
                    headers=self.headers,
                    timeout=10.0
                )
                return response.status_code == 200
                
            except Exception as e:
                logger.error(f"Daily.co health check failed: {e}")
                return False
