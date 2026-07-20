#!/bin/bash

# Hyggshi OS Web Proxy - Deployment Script
# This script deploys the Cloudflare Worker proxy

echo "======================================"
echo "Hyggshi OS Web Proxy Deployment"
echo "======================================"
echo ""

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    echo "❌ Wrangler CLI not found!"
    echo "Installing wrangler..."
    npm install -g wrangler
fi

echo "✓ Wrangler CLI found"
echo ""

# Check if user is logged in
echo "Checking Cloudflare authentication..."
if ! wrangler whoami &> /dev/null; then
    echo "⚠️  Not authenticated with Cloudflare"
    echo "Opening browser for login..."
    wrangler login
fi

echo "✓ Authenticated with Cloudflare"
echo ""

# Deploy the worker
echo "Deploying web-proxy.js..."
echo ""

cd "$(dirname "$0")"

wrangler deploy web-proxy.js --config wrangler-web-proxy.toml

echo ""
echo "======================================"
echo "Deployment Complete!"
echo "======================================"
echo ""
echo "Next steps:"
echo "1. Copy the Worker URL from the output above"
echo "2. Update js/apps-core.js with your Worker URL"
echo "3. Test by opening OSmain.html and navigating to https://game.chronodivide.com"
echo ""
echo "To view logs: wrangler tail"
echo ""