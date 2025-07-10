# Root Cause Analysis: Real-time Translator Issues

## Why These Issues Keep Happening

### 1. **Missing Import Error (500 Error on Share Link)**
**Root Cause**: The code was trying to use `settings` without importing it.
- FastAPI doesn't catch import errors at startup for code inside route handlers
- The error only manifests when the endpoint is actually called
- This is why it worked in development but failed in production

**Prevention**:
- Always run the backend with `--reload` during development
- Use a linter (pylint, flake8) to catch undefined variables
- Add integration tests that actually call the endpoints

### 2. **Configuration Missing (frontend_url)**
**Root Cause**: The code referenced `settings.frontend_url` which didn't exist in the Settings class.
- Pydantic settings won't error on missing attributes at startup
- The hasattr() check was masking the real issue
- Configuration drift between what code expects and what's defined

**Prevention**:
- Define all settings in the Settings class upfront
- Document all required environment variables
- Use type hints and IDE support to catch undefined attributes

### 3. **Route Ordering Issue (404 on /by-token)**
**Root Cause**: FastAPI matches routes in order, and the general route was before the specific one.
- `/public/{session_id}` was matching before `/public/{session_id}/by-token`
- This is a common FastAPI pitfall

**Prevention**:
- Always put more specific routes before general ones
- Test all route variations
- Use FastAPI's built-in docs (`/docs`) to verify routes

## Systematic Development Approach

### 1. **Local Testing Protocol**
Before pushing any changes:
```bash
# 1. Start backend with reload
cd backend
uvicorn app.main:app --reload

# 2. Check for startup errors
# 3. Test the actual endpoint
curl -X POST http://localhost:8000/api/v1/sessions/{session_id}/share-link \
  -H "Authorization: Bearer {token}"

# 4. Check logs for any errors
```

### 2. **Error Handling Best Practices**
```python
# Always add comprehensive logging
try:
    # Your code
except HTTPException:
    raise  # Re-raise HTTP exceptions
except Exception as e:
    logger.error(f"Unexpected error in {function_name}: {str(e)}", exc_info=True)
    raise HTTPException(status_code=500, detail=str(e))
```

### 3. **Configuration Management**
```python
# Always define settings explicitly
class Settings(BaseSettings):
    frontend_url: str = "http://localhost:3000"  # With default
    required_setting: str  # No default - will error if not set
```

### 4. **Testing Strategy**
Create integration tests for critical flows:
```python
def test_share_link_generation():
    # Create session
    # Generate share link
    # Verify link format
    # Test token validation
```

## Common Pitfalls in This Project

1. **WebSocket/HTTP coordination** - Complex state management
2. **Daily.co bot counting** - External service behavior
3. **JWT token handling** - Multiple token types (auth, share, Daily)
4. **Route conflicts** - Similar URL patterns
5. **Async/await gotchas** - Missing awaits cause subtle bugs

## Debugging Checklist

When something breaks:
1. ✓ Check backend logs for the actual error
2. ✓ Verify all imports are present
3. ✓ Confirm all settings are defined
4. ✓ Test the endpoint directly with curl
5. ✓ Check route ordering in FastAPI
6. ✓ Verify database state matches expectations
7. ✓ Look for missing `await` keywords
8. ✓ Check for None/null handling

## Development Workflow

1. **Make changes**
2. **Test locally** with actual API calls
3. **Check logs** for warnings/errors
4. **Verify in browser** with full flow
5. **Document** any new settings/endpoints
6. **Commit** with clear message

This systematic approach will prevent most issues from recurring.
