#!/bin/bash
echo "=== CSM Setup Script ==="
echo "Running in: $(pwd)"
echo "Node/Bun: $(bun --version 2>/dev/null || echo 'not found')"
echo "Installing dependencies..."
bun install
echo "=== Setup complete ==="
