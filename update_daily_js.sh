#!/bin/bash

# Update daily-js package

echo "Updating @daily-co/daily-js to the latest version..."

cd /Users/paruljuniwal/kuzushi_labs/mcp-servers/realtime-translator/frontend

# Remove the old version
npm uninstall @daily-co/daily-js

# Install the latest version
npm install @daily-co/daily-js@latest

echo "Daily.js has been updated to the latest version!"
echo "Please restart your development server."
