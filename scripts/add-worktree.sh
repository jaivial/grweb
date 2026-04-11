#!/bin/bash

# Usage: ./scripts/add-worktree.sh <branch-name> <destination-path>
# Example: ./scripts/add-worktree.sh feature-x ../grcup-feature-x

BRANCH_NAME=$1
DESTINATION_PATH=$2

if [ -z "$BRANCH_NAME" ] || [ -z "$DESTINATION_PATH" ]; then
  echo "Error: Missing arguments."
  echo "Usage: $0 <branch-name> <destination-path>"
  exit 1
fi

echo "Adding new git worktree for branch '$BRANCH_NAME' at '$DESTINATION_PATH'..."
git worktree add "$DESTINATION_PATH" "$BRANCH_NAME"

if [ $? -eq 0 ]; then
  echo "Worktree created successfully!"
else
  echo "Failed to create worktree. Please check if the branch exists and the path is valid."
  exit 1
fi
