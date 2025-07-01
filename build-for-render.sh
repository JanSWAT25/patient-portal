#!/bin/bash

set -e  # Exit on any error

echo "=== PATIENT PORTAL BUILD SCRIPT ==="
echo "Current directory: $(pwd)"
echo "Node version: $(node --version)"
echo "NPM version: $(npm --version)"

# Install backend dependencies
echo "Installing backend dependencies..."
npm ci

# Install and build frontend
echo "Installing frontend dependencies..."
cd client
npm ci

echo "Building React application..."
npm run build

# Verify build
echo "Verifying build..."
if [ ! -d "build" ]; then
    echo "❌ Build failed - build directory not created"
    exit 1
fi

if [ ! -f "build/index.html" ]; then
    echo "❌ Build failed - index.html not found"
    exit 1
fi

echo "✅ React build completed successfully"
echo "Build directory contents:"
ls -la build/

cd ..

echo "=== BUILD PROCESS COMPLETE ===" 