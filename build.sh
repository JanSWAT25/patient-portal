#!/bin/bash

echo "=== Starting Patient Portal Build Process ==="

# Install backend dependencies
echo "Installing backend dependencies..."
npm install

# Install and build frontend
echo "Installing frontend dependencies..."
cd client
npm install

echo "Building React application..."
npm run build

# Check if build was successful
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

echo "=== Build Process Complete ===" 