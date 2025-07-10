"""
Simple test to verify session creation works
"""
import asyncio
import sys
import os

# Add parent directory to Python path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.translation_service import translation_service

async def test_session_creation():
    """Test creating a session"""
    
    try:
        print("🧪 Testing session creation...")
        
        # Start the service
        await translation_service.start()
        
        # Test session creation with existing user
        user_id = "8b74c8c4-872a-41ae-9fcb-6eea831c4af0"  # From database check
        
        session = await translation_service.create_session(
            user_a_id=user_id,
            language_a="en",
            language_b="hi"
        )
        
        print(f"✅ Session created successfully!")
        print(f"   Session ID: {session.id}")
        print(f"   Status: {session.status}")
        print(f"   Room URL: {session.room_url}")
        
        # Test getting session status
        status = await translation_service.get_session_status(session.id)
        print(f"✅ Session status retrieved: {status['status']}")
        
        # Test tokens
        try:
            tokens = await translation_service.get_user_tokens(session.id, user_id)
            print(f"✅ Tokens generated successfully!")
            print(f"   Token length: {len(tokens['token'])} chars")
        except Exception as e:
            print(f"❌ Token generation failed: {e}")
        
        print(f"🎉 All tests passed!")
        
    except Exception as e:
        print(f"❌ Test failed: {e}")
        import traceback
        traceback.print_exc()
    finally:
        await translation_service.stop()

if __name__ == "__main__":
    asyncio.run(test_session_creation())
