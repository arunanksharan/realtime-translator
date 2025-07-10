#!/bin/bash

# Test script to verify all fixes are working
echo "🔬 Testing Realtime Translator Fixes"
echo "====================================="

# 1. Test database health
echo "📊 Step 1: Running database health check..."
cd /Users/paruljuniwal/kuzushi_labs/mcp-servers/realtime-translator/backend
source .venv/bin/activate
python scripts/db_health_check.py

echo ""
echo "🚀 Step 2: Starting backend server..."
echo "Starting backend in background (check logs for session creation)"
echo "Run: cd backend && source .venv/bin/activate && uvicorn app.main:app --reload --log-level debug"

echo ""
echo "🌐 Step 3: Frontend testing checklist:"
echo "1. cd frontend && npm run dev"
echo "2. Create a new session"
echo "3. Check browser console for WebSocket connection"
echo "4. Test copy URL button"
echo "5. Check network tab for /tokens API call"

echo ""
echo "🧪 Step 4: Manual tests to perform:"
echo "✅ Create session -> Should see detailed logs"
echo "✅ WebSocket connects -> Should stay connected"
echo "✅ Copy URL button -> Should copy to clipboard"
echo "✅ Token API -> Should return 200 with tokens"
echo "✅ No API bombardment -> Should see stable connections"

echo ""
echo "🔍 Step 5: Debug endpoints to test:"
echo "GET /api/v1/sessions/debug/auth - Test authentication"
echo "GET /health/detailed - Check service health"
echo "GET /stats - Check service statistics"

echo ""
echo "📝 Expected outcomes:"
echo "• No ROLLBACK in database operations"
echo "• WebSocket stays connected without loops"
echo "• Token endpoint returns tokens successfully"
echo "• Copy URL button works reliably"
echo "• New sessions show CREATED status instead of EXPIRED"

echo ""
echo "🎯 If all tests pass, the issues should be resolved!"
