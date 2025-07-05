# 🔄 Complete Data Flow: New Session → Daily.co Connection

## 📊 **Sequence of Events When You Click "New Session"**

### **1. 🎯 Frontend: Dashboard Click**
```
User clicks "New Session" card
↓
handleCreateSession() triggered
↓
router.push("/session/new") 
```

**Current Issue**: The route `/session/new` doesn't exist! Only `/session/[sessionId]` exists.

### **2. 🔧 **Missing: Session Creation Dialog**
The intended flow should be:
```
Click "New Session" 
↓
Open CreateSessionDialog component
↓
User selects languages (language_a, language_b)
↓
Submit form → API call to create session
```

### **3. 🌐 Backend: Session Creation API**
```
POST /api/v1/sessions/create
{
  "language_a": "en",
  "language_b": "es"
}
```

**Backend Process:**
1. **Authenticate user** from JWT token
2. **Create Daily.co room** via `DailyService.create_room()`
3. **Generate unique session ID** (UUID)
4. **Create database record** in `translation_sessions` table
5. **Return session data** including room URL

### **4. 📡 Daily.co Room Creation**
```javascript
// Backend calls Daily.co API
POST https://api.daily.co/v1/rooms
{
  "name": "translation_abc123",
  "properties": {
    "max_participants": 4,
    "exp": 1705123456,
    "enable_screenshare": false,
    "enable_chat": false,
    "start_audio_off": false,
    "start_video_off": true,
    "autojoin": true
  }
}

// Daily.co returns:
{
  "url": "https://domain.daily.co/translation_abc123",
  "name": "translation_abc123",
  "id": "room-id-12345"
}
```

### **5. 🔄 Frontend: Session Management**
```javascript
// After successful creation
const sessionData = {
  session_id: "abc123",
  room_url: "https://domain.daily.co/translation_abc123",
  language_a: "en",
  language_b: "es",
  status: "created",
  user_a_id: "user123"
}

// Store in session store
setCurrentSession(sessionData)

// Navigate to session page
router.push(`/session/${sessionData.session_id}`)
```

### **6. 🎤 Daily.co Connection Process**
When user navigates to `/session/[sessionId]`:

**A. Fetch Session Tokens:**
```javascript
// Frontend calls:
GET /api/v1/sessions/{sessionId}/token

// Backend creates Daily.co token:
POST https://api.daily.co/v1/meeting-tokens
{
  "properties": {
    "room_name": "translation_abc123",
    "user_name": "user123",
    "is_owner": false,
    "exp": 1705123456
  }
}

// Returns:
{
  "room_url": "https://domain.daily.co/translation_abc123",
  "token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...",
  "user_id": "user123",
  "session_id": "abc123"
}
```

**B. Connect to Daily.co:**
```javascript
// useDaily hook automatically joins when tokens available
const call = DailyIframe.createCallObject({
  audioSource: true,
  videoSource: false,
})

await call.join({
  url: sessionTokens.room_url,
  token: sessionTokens.token,
})
```

### **7. 🤝 How Other User Joins**

**Option 1: Direct Invite**
```
User A shares session URL: /session/abc123
↓
User B visits URL
↓
User B calls JOIN API
↓
Session updated with user_b_id
```

**Option 2: Session List**
```
User B checks their session list
↓
Sees "waiting" sessions they're invited to
↓
Clicks join → same flow as above
```

**Option 3: Invite Code**
```
User A generates invite code
↓
User B enters invite code
↓
System finds session by code
↓
Joins session
```

### **8. 🔄 Real-time Updates**
```
WebSocket connection established
↓
Session status updates broadcast
↓
Both users see status changes
↓
Translation pipeline starts when both users connected
```

## 🐛 **Current Issues & Fixes Needed**

### **Issue 1: Missing Session Creation Route**
```javascript
// Add to dashboard/page.tsx
const handleCreateSession = () => {
  setShowCreateDialog(true) // Instead of router.push
}

// Add CreateSessionDialog usage
<CreateSessionDialog 
  open={showCreateDialog} 
  onOpenChange={setShowCreateDialog} 
/>
```

### **Issue 2: Missing /session/new Route**
Either:
- **Option A**: Use dialog in dashboard (recommended)
- **Option B**: Create `/session/new/page.tsx` with form

### **Issue 3: Session Join Flow**
Need to handle:
- User B discovering sessions
- Invite system
- Session sharing URLs

## 🌟 **Complete Flow Diagram**

```
[User A] Dashboard
    ↓ (clicks New Session)
[Dialog] Language Selection
    ↓ (submits form)
[API] POST /sessions/create
    ↓
[Daily.co] Create Room
    ↓
[Database] Store Session
    ↓
[Frontend] Navigate to /session/abc123
    ↓
[API] GET /sessions/abc123/token
    ↓
[Daily.co] Create User Token
    ↓
[Frontend] Connect to Daily.co Room
    ↓
[WebSocket] Real-time Updates
    ↓
[Translation] Pipeline Ready

    Meanwhile...

[User B] Receives invite/finds session
    ↓
[Frontend] Navigate to /session/abc123
    ↓
[API] POST /sessions/join
    ↓
[Database] Update session with user_b_id
    ↓
[API] GET /sessions/abc123/token
    ↓
[Daily.co] Create User B Token
    ↓
[Frontend] Connect to Daily.co Room
    ↓
[Translation] Both users connected → Start Pipeline
```

## 🎯 **Key Technologies**

1. **Daily.co**: WebRTC room management
2. **WebSocket**: Real-time session updates
3. **JWT Tokens**: Authentication + Daily.co room access
4. **Database**: Session persistence
5. **Translation Pipeline**: AI-powered real-time translation

## 🔧 **Next Steps to Fix**

1. **Fix dashboard navigation** - use dialog instead of route
2. **Implement session sharing** - invite codes or URLs
3. **Add session discovery** - list available sessions
4. **Test Daily.co integration** - verify room creation
5. **Add error handling** - connection failures, expired sessions

The core architecture is solid - just need to connect the frontend flow properly! 🚀
