# Session Join Flow Fix

## Problem Analysis

The current implementation has several issues:

1. **Share link includes a token** - The backend generates: `http://localhost:3000/session/{session_id}?token={share_token}`
2. **Frontend ignores the token** - The session page doesn't use the token parameter
3. **Public endpoint exists but not used properly** - `/sessions/public/{session_id}` endpoint exists
4. **User B gets 403 error** - Because they're not yet part of the session

## Solution Implementation

### 1. Update the session page to handle share tokens

```tsx
// Add to the session page component
const shareToken = searchParams.get('token')

// Use different endpoints based on authentication and token
const { data: session, isLoading: sessionLoading, error: sessionError } = 
  shareToken 
    ? usePublicSessionWithToken(sessionId, shareToken)  // New hook for token-based access
    : isAuthenticated 
      ? useSession(sessionId)
      : usePublicSession(sessionId)
```

### 2. Create a new API endpoint for token-based session access

```python
@router.get("/public/{session_id}/by-token", response_model=SessionResponse)
async def get_session_by_share_token(
    session_id: str,
    token: str = Query(..., description="Share token")
):
    """Get session details using share token (for User B joining)"""
    
    # Verify the share token
    is_valid = await translation_service.verify_share_token(session_id, token)
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired share token"
        )
    
    # Return session details
    session_status = await translation_service.get_session_status(session_id)
    if not session_status:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found"
        )
    
    return SessionResponse(**session_status)
```

### 3. Update the join flow to be more intuitive

When User B visits the share link:
1. They see session details (languages, status) without authentication
2. A prominent "Join Session" button is displayed
3. Clicking "Join" redirects to login if needed
4. After login, they're automatically redirected back and joined to the session

### 4. Add role parameter to differentiate users

Update share link generation to include role:
```python
share_link = f"http://localhost:3000/session/{session_id}?token={share_token}&role=userB"
```

This makes it clear that the visitor is joining as User B.
