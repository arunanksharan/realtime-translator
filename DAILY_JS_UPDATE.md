# Daily.js Version Update

## Issue
You're seeing the warning:
```
daily-js version 0.72.2 is no longer supported. Please upgrade to a newer version.
```

## Solution

### Option 1: Quick Update (Recommended)
Run the following commands in your frontend directory:

```bash
cd /Users/paruljuniwal/kuzushi_labs/mcp-servers/realtime-translator/frontend

# Update to the latest version
npm install @daily-co/daily-js@latest
```

### Option 2: Use the Update Script
I've created a script to handle the update:

```bash
chmod +x /Users/paruljuniwal/kuzushi_labs/mcp-servers/realtime-translator/update_daily_js.sh
./update_daily_js.sh
```

### Option 3: Manual Update
1. Edit `frontend/package.json`
2. Change `"@daily-co/daily-js": "^0.72.0"` to `"@daily-co/daily-js": "^0.73.0"` or latest
3. Run `npm install`

## After Updating

1. **Restart your development server**:
   ```bash
   npm run dev
   ```

2. **Clear browser cache** if you still see the warning

3. **Test the video/audio functionality** to ensure everything works correctly

## Potential Breaking Changes

Daily.js typically maintains backward compatibility, but check for:
- Any changes in event names
- Updated method signatures
- New required configuration options

## Version Information

- **Current Version**: 0.72.0 (outdated)
- **Minimum Supported**: 0.73.0+
- **Recommended**: Latest stable version

The warning is coming from Daily's servers, not your code, so updating the package should resolve it immediately.
