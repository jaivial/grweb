#!/bin/bash

# Script to create a new git worktree for a feature branch
# Usage: bash scripts/create-worktree.sh <feature-name>

FEATURE_NAME=$1

if [ -z "$FEATURE_NAME" ]; then
  echo "Error: No feature name provided."
  echo "Usage: bash scripts/create-worktree.sh <feature-name>"
  exit 1
fi

WORKTREE_DIR="../${FEATURE_NAME}-worktree"
BRANCH_NAME="feature/${FEATURE_NAME}"

echo "Creating worktree at ${WORKTREE_DIR} on branch ${BRANCH_NAME}..."
git worktree add "${WORKTREE_DIR}" -b "${BRANCH_NAME}"

echo "Worktree created successfully!"
