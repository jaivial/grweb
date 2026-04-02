# Claude Code Multi-Provider Gateway Setup

This guide explains how to set up a local LiteLLM gateway to switch between AI providers (Minimax, GLM, OpenRouter) in Claude Code without restarting.

## Overview

```
Claude Code → /model minimax → localhost:4000 (LiteLLM) → api.minimax.io
            → /model glm-51  →                       → api.z.ai
            → /model openrouter/qwen →                → openrouter.ai
```

**Benefits:**
- Switch models instantly with `/model` command
- No restart required
- Single configuration point for all providers

## Prerequisites

- Python 3.10+
- pip
- API keys for providers you want to use

## Installation

### 1. Install LiteLLM

```bash
pip install 'litellm[proxy]' --break-system-packages
```

### 2. Create Gateway Directory

```bash
mkdir -p ~/.claude-gateway
cd ~/.claude-gateway
```

### 3. Create Configuration Files

#### config.yaml

```yaml
model_list:
  - model_name: minimax
    litellm_params:
      model: anthropic/MiniMax-M2.7-highspeed
      api_key: os.environ/MINIMAX_API_KEY
      api_base: https://api.minimax.io/anthropic

  - model_name: glm-5
    litellm_params:
      model: anthropic/GLM-5
      api_key: os.environ/ZHIPU_API_KEY
      api_base: https://api.z.ai/api/anthropic

  - model_name: glm-51
    litellm_params:
      model: anthropic/GLM-5.1
      api_key: os.environ/ZHIPU_API_KEY
      api_base: https://api.z.ai/api/anthropic

  - model_name: openrouter/qwen
    litellm_params:
      model: openai/qwen/qwen3.6-plus:free
      api_key: os.environ/OPENROUTER_API_KEY
      api_base: https://openrouter.ai/api/v1
      headers:
        HTTP-Referer: https://claude-code.local
        X-Title: Claude Code Gateway

general_settings:
  master_key: os.environ/GATEWAY_MASTER_KEY
  add_function_to_prompt: true
  drop_params: true

litellm_settings:
  success_callback: []
  failure_callback: []
  set_verbose: false
```

#### .env

```bash
# API Keys - Replace with your actual keys
MINIMAX_API_KEY=sk-cp-your-minimax-key
ZHIPU_API_KEY=your-zhipu-api-key
OPENROUTER_API_KEY=sk-or-your-openrouter-key

# Gateway master key (any string for local auth)
GATEWAY_MASTER_KEY=your-random-secret-key
```

```bash
chmod 600 ~/.claude-gateway/.env
```

#### start.sh

```bash
#!/bin/bash

GATEWAY_DIR="$HOME/.claude-gateway"
PID_FILE="$GATEWAY_DIR/gateway.pid"
LOG_FILE="$GATEWAY_DIR/gateway.log"
PORT=4000

if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    if kill -0 "$PID" 2>/dev/null; then
        echo "Gateway already running (PID: $PID)"
        exit 0
    fi
    rm -f "$PID_FILE"
fi

cd "$GATEWAY_DIR"

set -a
source .env 2>/dev/null || {
    echo "Error: .env file not found. Copy .env.example to .env and add your keys."
    exit 1
}
set +a

echo "Starting Claude Code Gateway on port $PORT..."
env MINIMAX_API_KEY="$MINIMAX_API_KEY" \
    ZHIPU_API_KEY="$ZHIPU_API_KEY" \
    OPENROUTER_API_KEY="$OPENROUTER_API_KEY" \
    GATEWAY_MASTER_KEY="$GATEWAY_MASTER_KEY" \
    nohup litellm --config config.yaml --port $PORT --detailed_debug > "$LOG_FILE" 2>&1 &
echo $! > "$PID_FILE"

sleep 2

if kill -0 $(cat "$PID_FILE") 2>/dev/null; then
    echo "✓ Gateway running on http://localhost:$PORT"
    echo "  PID: $(cat $PID_FILE)"
    echo "  Log: $LOG_FILE"
else
    echo "✗ Failed to start gateway. Check $LOG_FILE for details."
    rm -f "$PID_FILE"
    exit 1
fi
```

#### stop.sh

```bash
#!/bin/bash

GATEWAY_DIR="$HOME/.claude-gateway"
PID_FILE="$GATEWAY_DIR/gateway.pid"

if [ ! -f "$PID_FILE" ]; then
    echo "Gateway not running (no PID file)"
    exit 0
fi

PID=$(cat "$PID_FILE")

if kill -0 "$PID" 2>/dev/null; then
    kill "$PID"
    echo "✓ Gateway stopped (PID: $PID)"
else
    echo "Gateway not running (stale PID file)"
fi

rm -f "$PID_FILE"
```

#### health.sh

```bash
#!/bin/bash

GATEWAY_DIR="$HOME/.claude-gateway"
PID_FILE="$GATEWAY_DIR/gateway.pid"
PORT=4000

echo "Claude Code Gateway Status"
echo "=========================="

if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    if kill -0 "$PID" 2>/dev/null; then
        echo "✓ Running (PID: $PID)"
        echo "  URL: http://localhost:$PORT"
        echo ""
        echo "Available models:"
        echo "  - minimax"
        echo "  - glm-5"
        echo "  - glm-51"
        echo "  - openrouter/qwen"
    else
        echo "✗ Not running (stale PID file)"
        rm -f "$PID_FILE"
        exit 1
    fi
else
    echo "✗ Not running"
    echo ""
    echo "Start with: ~/.claude-gateway/start.sh"
    exit 1
fi
```

Make scripts executable:

```bash
chmod +x ~/.claude-gateway/*.sh
```

### 4. Configure Claude Code

Update `~/.claude/settings.json`:

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "http://localhost:4000",
    "ANTHROPIC_AUTH_TOKEN": "your-random-secret-key",
    "API_TIMEOUT_MS": "3000000",
    "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1"
  },
  "skipDangerousModePermissionPrompt": true
}
```

**Important:** `ANTHROPIC_AUTH_TOKEN` must match `GATEWAY_MASTER_KEY` from `.env`.

### 5. Auto-start on Shell Login

Add to `~/.bashrc` or `~/.zshrc`:

```bash
# Claude Code Gateway - Auto-start LiteLLM proxy
if [ -f ~/.claude-gateway/start.sh ]; then
    ~/.claude-gateway/start.sh 2>/dev/null
fi
```

### 6. Start and Test

```bash
# Start the gateway
~/.claude-gateway/start.sh

# Verify it's running
~/.claude-gateway/health.sh

# Test a model
curl -s http://localhost:4000/v1/messages \
  -H "Authorization: Bearer your-random-secret-key" \
  -H "Content-Type: application/json" \
  -H "anthropic-version: 2023-06-01" \
  -d '{"model": "glm-51", "max_tokens": 30, "messages": [{"role": "user", "content": "Hi"}]}'
```

## Usage in Claude Code

Start Claude Code and switch models:

```
/model minimax
/model glm-5
/model glm-51
/model openrouter/qwen
```

## Adding More Models

### Adding a new OpenRouter model

Edit `~/.claude-gateway/config.yaml`:

```yaml
  - model_name: openrouter/claude
    litellm_params:
      model: openai/anthropic/claude-3.5-sonnet
      api_key: os.environ/OPENROUTER_API_KEY
      api_base: https://openrouter.ai/api/v1
      headers:
        HTTP-Referer: https://claude-code.local
        X-Title: Claude Code Gateway
```

### Adding a new Anthropic-compatible provider

```yaml
  - model_name: my-provider
    litellm_params:
      model: anthropic/model-name
      api_key: os.environ/MY_PROVIDER_API_KEY
      api_base: https://api.myprovider.com/anthropic
```

After changes, restart the gateway:

```bash
~/.claude-gateway/stop.sh && ~/.claude-gateway/start.sh
```

## Troubleshooting

### Gateway won't start

```bash
# Check logs
tail -50 ~/.claude-gateway/gateway.log

# Verify Python/LiteLLM
python3 -c "import litellm; print(litellm.__version__)"

# Check if port is in use
lsof -i :4000
```

### API errors in Claude Code

1. Verify gateway is running: `~/.claude-gateway/health.sh`
2. Check API keys in `.env` are correct
3. Verify `ANTHROPIC_AUTH_TOKEN` matches `GATEWAY_MASTER_KEY`
4. Check gateway logs for detailed errors

### Model not found

1. Verify model name in `config.yaml` matches provider's API
2. Check your API key has access to that model
3. Test directly with curl (see example above)

### Environment variables not loading

The `start.sh` script exports env vars before starting LiteLLM. If issues occur:

```bash
# Debug: print loaded env vars
cd ~/.claude-gateway
set -a && source .env && set +a
echo "MINIMAX_API_KEY: ${MINIMAX_API_KEY:0:10}..."
```

## File Structure

```
~/.claude-gateway/
├── config.yaml       # LiteLLM model routing
├── .env              # API keys (chmod 600)
├── start.sh          # Start gateway
├── stop.sh           # Stop gateway
├── health.sh         # Check status
├── gateway.log       # Log output
└── gateway.pid       # Process ID
```

## Security Notes

- `.env` file should have `chmod 600` (only owner can read)
- Never commit API keys to version control
- `GATEWAY_MASTER_KEY` can be any random string for local use
- For shared/team deployments, use proper authentication

## Alternative: Fallback Scripts

If you prefer shell scripts that require restart (simpler, no gateway):

```bash
# ~/.claude/scripts/switch-to-zai.sh
#!/bin/bash
SETTINGS_FILE="$HOME/.claude/settings.json"
cat > "$SETTINGS_FILE" << 'EOF'
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://api.z.ai/api/anthropic",
    "ANTHROPIC_AUTH_TOKEN": "your-api-key",
    "ANTHROPIC_MODEL": "GLM-5.1"
  }
}
EOF
echo "Switched to Z.ai GLM-5.1 - Restart Claude Code"
```

## References

- [LiteLLM Documentation](https://docs.litellm.ai/)
- [Claude Code Settings](https://docs.anthropic.com/en/docs/claude-code/settings)
- [Claude Code LLM Gateway](https://docs.anthropic.com/en/docs/claude-code/llm-gateway)
