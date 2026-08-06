#!/usr/bin/env bash
# Pulls every language image ahead of time so the first real submission
# isn't slow (or worse, times out) waiting on a cold image pull.
# Run this once after installing Docker on your VPS, and again any
# time you add a language to src/languages.js.

set -e

IMAGES=(
  "python:3.12-slim"
  "node:20-slim"
  "gcc:13"
  "eclipse-temurin:21-jdk"
  "mcr.microsoft.com/dotnet/sdk:8.0"
  "golang:1.22"
  "rust:1.75-slim"
  "ruby:3.2-slim"
  "php:8.2-cli"
  "bash:5"
)

for img in "${IMAGES[@]}"; do
  echo "=== Pulling $img ==="
  docker pull "$img"
done

echo ""
echo "=== Building custom TypeScript image ==="
docker build -t codebuddy/typescript:latest ./typescript

echo ""
echo "All images ready. Verify with: docker images"
