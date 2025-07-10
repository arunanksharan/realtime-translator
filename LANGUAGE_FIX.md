# Translation Language Issue Fix

## Problem Summary

User B was seeing Spanish translations instead of Hindi when the session was configured for English to Hindi translation.

## Root Causes Identified

### 1. **Wrong Pipeline Manager Being Used**
- The system was using `pipeline_manager_simple.py` which is a **demo/simplified version**
- This simplified version has **hardcoded Spanish translations** for demo purposes:
  ```python
  translated_text=f"Hola, este es el mensaje de prueba {self.translation_count}",
  ```

### 2. **Language Code Handling**
- The system instructions were using raw language codes ("en", "hi") 
- Gemini works better with full language names ("English", "Hindi")

### 3. **404 Metrics Error**
- The simplified pipeline manager doesn't implement real metrics
- This causes 404 errors when the frontend tries to fetch metrics

## Fixes Applied

### 1. **Switched to Real Pipeline Manager** ✅
```python
# Changed from:
from app.services.pipeline_manager_simple import DualPipelineManager

# To:
from app.services.pipeline_manager import DualPipelineManager
```

### 2. **Enhanced Language Mapping** ✅
Added proper language name mapping in the system instructions:
```python
language_names = {
    "en": "English",
    "hi": "Hindi",
    # ... other languages
}
```

### 3. **Improved System Instructions** ✅
- Now uses full language names with codes for clarity
- Explicitly instructs to ONLY translate to the target language
- Better context about which user speaks which language

## Action Required

1. **Restart the backend server**:
   ```bash
   cd backend
   uvicorn app.main:app --reload
   ```

2. **Stop any active sessions** and create new ones

3. **Test the translation**:
   - User A (English) should see Hindi translations
   - User B (Hindi) should see English translations
   - No Spanish should appear!

## Why This Happened

The project has two pipeline managers:
1. **`pipeline_manager.py`** - Real implementation using Gemini API
2. **`pipeline_manager_simple.py`** - Simplified demo with hardcoded responses

During development, the import was switched to the simple version (likely for testing without API calls), but wasn't switched back.

## Prevention

1. **Remove or clearly mark demo code**
2. **Use feature flags for demo mode**:
   ```python
   if settings.demo_mode:
       from .pipeline_manager_simple import DualPipelineManager
   else:
       from .pipeline_manager import DualPipelineManager
   ```

3. **Add integration tests** that verify actual language pairs

## Verification

After restarting, check:
1. Console logs should show proper language names in system instructions
2. Translations should be in the correct languages (not Spanish!)
3. No 404 errors for metrics endpoints

The real-time translation should now work correctly with Hindi-English pairs!
