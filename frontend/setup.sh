#!/bin/bash

# 🚀 Realtime Translator Frontend Setup Script

echo "🎯 Setting up Realtime Translator Frontend..."
echo "=========================================="

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first."
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node --version)
echo "✅ Node.js version: $NODE_VERSION"

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm first."
    exit 1
fi

# Change to frontend directory
cd "$(dirname "$0")"

echo "📦 Installing dependencies..."
npm install

if [ $? -eq 0 ]; then
    echo "✅ Dependencies installed successfully!"
else
    echo "❌ Failed to install dependencies"
    exit 1
fi

echo "🔧 Setting up environment variables..."
if [ ! -f .env.local ]; then
    cp .env.example .env.local
    echo "✅ Created .env.local from .env.example"
    echo "📝 Please update .env.local with your actual values"
else
    echo "✅ .env.local already exists"
fi

echo "🎨 Checking TypeScript configuration..."
npm run type-check

if [ $? -eq 0 ]; then
    echo "✅ TypeScript configuration is valid!"
else
    echo "❌ TypeScript configuration has errors"
    exit 1
fi

echo ""
echo "🎉 Setup complete! You can now:"
echo "  • Start development server: npm run dev"
echo "  • Build for production: npm run build"
echo "  • Run type checking: npm run type-check"
echo "  • Run tests: npm run test"
echo ""
echo "🌐 The app will be available at: http://localhost:3000"
echo "📚 Read the README.md for more information"
