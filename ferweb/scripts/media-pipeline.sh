#!/usr/bin/env bash
#
# fer-media-pipeline.sh — Google Drive → WebP/WebM → BunnyCDN pipeline
#
# Reads file inventory from state.json, processes in batches,
# tracks status per file, retries failures with exponential backoff.
#
# Usage:
#   ./fer-media-pipeline.sh              # Run one batch
#   ./fer-media-pipeline.sh --init       # Bootstrap state.json from Drive
#   ./fer-media-pipeline.sh --status     # Show progress
#   ./fer-media-pipeline.sh --retry      # Force retry all failed
#   ./fer-media-pipeline.sh --all        # Process everything (no batch limit)
#
# Cron (every 10 min):
#   */10 * * * * /var/www/grweb/ferweb/scripts/fer-media-pipeline.sh >> /var/www/grweb/ferweb/scripts/pipeline.log 2>&1
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STATE_FILE="$SCRIPT_DIR/pipeline-state.json"
LOG_FILE="$SCRIPT_DIR/pipeline.log"

# Config
WORK_DIR="/tmp/fer-pipeline"
BATCH_SIZE=${BATCH_SIZE:-10}
DELAY_BETWEEN_FILES=${DELAY_BETWEEN_FILES:-5}   # seconds between downloads
DELAY_BETWEEN_BATCHES=${DELAY_BETWEEN_BATCHES:-120} # seconds between batches
MAX_RETRIES=${MAX_RETRIES:-5}
MAX_IMAGE_SIZE=${MAX_IMAGE_SIZE:-70000}    # 70KB
MAX_VIDEO_SIZE=${MAX_VIDEO_SIZE:-1500000}  # 1.5MB

# BunnyCDN
BUNNY_ZONE="jaimedigitalstudio"
BUNNY_API="https://storage.bunnycdn.com"
BUNNY_KEY=""  # loaded from .env

# Google Drive root folder
GDRIVE_ROOT="1eSnphv6EkhoULkgA19EYdEKrV6g0fdBv"

# Subfolder ID mapping
declare -A GDRIVE_FOLDERS=(
  ["Alfonso Fernández"]="1DaAq4tyBBubac0pkZslVl55GocHBm-mm"
  ["FERNANDO RIPOLL"]="1-Z9Q2ffaSt69cpGZULtC9hmbyikJNedU"
  ["Lucas Hanono"]="1ZQL2ctp4pqEOMDKnduiAt__9TNNDUCK6"
  ["Mayte Valiente"]="1myFPRvuIMdcGrD4Ij-STrDIrA_DoDjkC"
  ["Miguel"]="1x6HRM2ZPMSNk8KD2cfgbW_GAWcD_AbBG"
  ["Raúl Martínez"]="1rwwNU01wVeGRKBpImYr2qL0QsACZmsvF"
  ["Reme"]="1kI77b2CcXHn3Vy_fhoVVe0CEOaeGYaZw"
  ["Rodrigo Tello"]="15PxgfMS1ea-H1hNxkgtv1CQIrRsSsf0B"
  ["Sergio García"]="1gxQdMJIqfX5djXWhbtC1LeOfX31--a2k"
  ["FOTOS AEP 2"]="1t31Dv_Q_ITbWJiYQRYHyHb8XGoVT2bOJ"
  ["General"]="$GDRIVE_ROOT"
)

# ─── Logging ────────────────────────────────────────────────────────────────

log()  { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
err()  { echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $*" >&2; }

# ─── Load BunnyCDN key ─────────────────────────────────────────────────────

load_env() {
  local env_file="$SCRIPT_DIR/../.env"
  if [ -f "$env_file" ]; then
    # shellcheck disable=SC1090
    source "$env_file"
  fi
  # Try backend .env as fallback
  if [ -z "${BUNNYCDN_PASSWORD:-}" ]; then
    local backend_env="/var/www/grweb/backend/GrCup.Api/.env"
    if [ -f "$backend_env" ]; then
      BUNNYCDN_PASSWORD=$(grep '^BUNNYCDN_PASSWORD=' "$backend_env" | cut -d= -f2)
    fi
  fi
  BUNNY_KEY="${BUNNYCDN_PASSWORD:-}"
  if [ -z "$BUNNY_KEY" ]; then
    err "BUNNYCDN_PASSWORD not set. Check .env files."
    exit 1
  fi
}

# ─── State management ──────────────────────────────────────────────────────

state_init() {
  if [ -f "$STATE_FILE" ]; then
    log "State file exists at $STATE_FILE"
    return
  fi

  log "Initializing state file..."
  mkdir -p "$WORK_DIR" "$SCRIPT_DIR"

  # Build initial state by listing each Google Drive subfolder via gdown --dry-run
  local tmp_state
  tmp_state=$(mktemp)
  echo '{"files":{},"stats":{"total":0,"downloaded":0,"transformed":0,"uploaded":0,"failed":0},"last_run":null}' > "$tmp_state"

  for folder_name in "${!GDRIVE_FOLDERS[@]}"; do
    local folder_id="${GDRIVE_FOLDERS[$folder_name]}"
    log "Scanning folder: $folder_name ($folder_id)"

    # Use gdown to list files (just prints, doesn't download to /dev/null)
    local listing
    listing=$(gdown --folder "$folder_id" -O "$WORK_DIR/.gdown-scan" 2>&1 | grep "Processing file" || true)
    rm -rf "$WORK_DIR/.gdown-scan" 2>/dev/null

    while IFS= read -r line; do
      local file_id file_name
      file_id=$(echo "$line" | grep -oP 'Processing file \K[^ ]+' || echo "")
      file_name=$(echo "$line" | sed 's/Processing file [^ ]* //' || echo "")

      if [ -z "$file_id" ] || [ -z "$file_name" ]; then
        continue
      fi

      # Skip if already tracked (root folder includes subfolder files)
      local already
      already=$(jq -r --arg id "$file_id" 'has("files") and (.files | has($id))' "$tmp_state" 2>/dev/null || echo "false")
      if [ "$already" = "true" ]; then
        continue
      fi

      local ext="${file_name##*.}"
      ext=$(echo "$ext" | tr '[:upper:]' '[:lower:]')
      local is_video="false"
      if [[ "$ext" =~ ^(mp4|mov|avi|mkv|webm)$ ]]; then
        is_video="true"
      fi

      local target_ext="webp"
      if [ "$is_video" = "true" ]; then
        target_ext="webm"
      fi

      local target_name="${file_name%.*}.${target_ext}"
      local cdn_path="fer/media/GRS - FOTOS _ CLUB/${folder_name}/${target_name}"

      # Add to state
      jq --arg id "$file_id" \
         --arg name "$file_name" \
         --arg folder "$folder_name" \
         --arg ext "$ext" \
         --arg target "$target_name" \
         --arg cdn "$cdn_path" \
         --arg video "$is_video" \
         '.files[$id] = {
           "drive_id": $id,
           "original_name": $name,
           "folder": $folder,
           "extension": $ext,
           "target_name": $target,
           "cdn_path": $cdn,
           "is_video": ($video == "true"),
           "status": "pending",
           "retries": 0,
           "last_error": null,
           "bytes": 0,
           "updated_at": null
         } | .stats.total = (.files | length)' \
         "$tmp_state" > "${tmp_state}.tmp" && mv "${tmp_state}.tmp" "$tmp_state"

    done <<< "$listing"
  done

  # Update total count
  local total
  total=$(jq '.files | length' "$tmp_state")
  jq --arg total "$total" '.stats.total = ($total | tonumber)' "$tmp_state" > "${tmp_state}.tmp" \
    && mv "${tmp_state}.tmp" "$tmp_state"

  mv "$tmp_state" "$STATE_FILE"
  log "State initialized: $total files tracked in $STATE_FILE"
}

state_update_file() {
  local drive_id="$1"
  local status="$2"
  local bytes="${3:-0}"
  local error="${4:-null}"
  local lock="${STATE_FILE}.lock"

  (
    flock -w 30 200 || { err "Could not acquire state lock"; return 1; }

    local tmpf
    tmpf=$(mktemp "${STATE_FILE}.XXXXXX")

    jq --arg id "$drive_id" \
       --arg status "$status" \
       --argjson bytes "$bytes" \
       --arg error "$error" \
       --arg now "$(date -Iseconds)" \
       '(.files[$id] // {}) |= . + {
         "status": $status,
         "bytes": $bytes,
         "last_error": (if $error == "null" then null else $error end),
         "updated_at": $now,
         "retries": (if $status == "pending" then (.retries + 1) else .retries end)
       } | .stats.downloaded = ([.files[] | select(.status == "downloaded")] | length)
         | .stats.transformed = ([.files[] | select(.status == "transformed")] | length)
         | .stats.uploaded   = ([.files[] | select(.status == "uploaded")]   | length)
         | .stats.failed     = ([.files[] | select(.status == "failed")]     | length)
         | .last_run = $now' \
       "$STATE_FILE" > "$tmpf" && mv "$tmpf" "$STATE_FILE"

  ) 200>"$lock"
}

# ─── Status report ─────────────────────────────────────────────────────────

show_status() {
  if [ ! -f "$STATE_FILE" ]; then
    echo "No state file. Run with --init first."
    exit 1
  fi

  echo ""
  echo "=== FER Media Pipeline Status ==="
  echo "State file: $STATE_FILE"
  echo ""

  local total pending downloaded transformed uploaded failed
  total=$(jq '.stats.total' "$STATE_FILE")
  pending=$(jq '[.files[] | select(.status == "pending")] | length' "$STATE_FILE")
  downloaded=$(jq '[.files[] | select(.status == "downloaded")] | length' "$STATE_FILE")
  transformed=$(jq '[.files[] | select(.status == "transformed")] | length' "$STATE_FILE")
  uploaded=$(jq '[.files[] | select(.status == "uploaded")] | length' "$STATE_FILE")
  failed=$(jq '[.files[] | select(.status == "failed")] | length' "$STATE_FILE")
  local last_run
  last_run=$(jq -r '.last_run // "never"' "$STATE_FILE")

  echo "Total:       $total"
  echo "Pending:     $pending"
  echo "Downloaded:  $downloaded"
  echo "Transformed: $transformed"
  echo "Uploaded:    $uploaded"
  echo "Failed:      $failed"
  echo ""
  echo "Last run: $last_run"
  echo ""
  echo "--- By folder ---"
  jq -r '.files | to_entries | map(.value.folder) | unique | .[]' "$STATE_FILE" | while read -r folder; do
    local statuses
    statuses=$(jq -r --arg f "$folder" '.files | to_entries[] | select(.value.folder == $f) | .value.status' "$STATE_FILE" | sort | uniq -c | awk '{printf "%s: %d, ", $2, $1}' | sed 's/, $//')
    echo "  $folder: $statuses"
  done

  if [ "$failed" -gt 0 ]; then
    echo ""
    echo "--- Failed files ---"
    jq -r '.files | to_entries[] | select(.value.status == "failed") | "  \(.value.original_name) — \(.value.last_error) (retries: \(.value.retries))"' "$STATE_FILE"
  fi
  echo ""
}

# ─── Pipeline steps ────────────────────────────────────────────────────────

step_download() {
  local drive_id="$1"
  local folder="$2"
  local original_name="$3"
  local dest_dir="$WORK_DIR/raw/GRS - FOTOS _ CLUB/$folder"
  local dest="$dest_dir/$original_name"

  mkdir -p "$dest_dir"

  # Try gdown first, fall back to curl
  if gdown "$drive_id" -O "$dest" 2>/dev/null; then
    if file "$dest" | grep -qiE "image|video|jpeg|png|m4v"; then
      local bytes
      bytes=$(stat -c%s "$dest" 2>/dev/null || echo "0")
      log "  Downloaded: $original_name ($bytes bytes)"
      state_update_file "$drive_id" "downloaded" "$bytes"
      return 0
    fi
  fi

  # Fallback: curl with Google Drive export
  rm -f "$dest"
  curl -sL "https://drive.google.com/uc?export=download&id=$drive_id" -o "$dest" 2>/dev/null
  if file "$dest" | grep -qiE "image|video|jpeg|png|m4v"; then
    local bytes
    bytes=$(stat -c%s "$dest" 2>/dev/null || echo "0")
    log "  Downloaded (curl): $original_name ($bytes bytes)"
    state_update_file "$drive_id" "downloaded" "$bytes"
    return 0
  fi

  rm -f "$dest"
  state_update_file "$drive_id" "pending" 0 "Download failed (rate limited or not found)"
  return 1
}

step_transform() {
  local drive_id="$1"
  local folder="$2"
  local original_name="$3"
  local target_name="$4"
  local is_video="$5"

  local src="$WORK_DIR/raw/GRS - FOTOS _ CLUB/$folder/$original_name"
  local dest_dir="$WORK_DIR/processed/GRS - FOTOS _ CLUB/$folder"
  local dest="$dest_dir/$target_name"

  mkdir -p "$dest_dir"

  if [ "$is_video" = "true" ]; then
    # Video → WebM (max 1.5MB)
    local duration
    duration=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$src" 2>/dev/null || echo "30")
    local bitrate=$(( MAX_VIDEO_SIZE * 8 / duration ))
    bitrate=$((bitrate < 500000 ? 500000 : bitrate))
    bitrate=$((bitrate > 2000000 ? 2000000 : bitrate))

    if ffmpeg -y -i "$src" -c:v libvpx-vp9 -b:v "$bitrate" -crf 35 \
         -vf "scale=1280:-2" -an -threads 4 "$dest" 2>/dev/null; then
      local bytes
      bytes=$(stat -c%s "$dest" 2>/dev/null || echo "0")
      log "  Transformed video: $target_name ($bytes bytes)"
      state_update_file "$drive_id" "transformed" "$bytes"
      return 0
    fi
  else
    # Image → WebP (max 70KB, iterative quality reduction)
    local quality=80
    while [ $quality -ge 10 ]; do
      cwebp -q "$quality" -mt -quiet "$src" -o "$dest" 2>/dev/null || true
      local bytes
      bytes=$(stat -c%s "$dest" 2>/dev/null || echo "999999")
      if [ "$bytes" -le "$MAX_IMAGE_SIZE" ]; then
        log "  Transformed: $target_name ($bytes bytes, q=$quality)"
        state_update_file "$drive_id" "transformed" "$bytes"
        return 0
      fi
      quality=$((quality - 5))
    done

    # Resize fallback
    cwebp -q 30 -mt -quiet -resize 1920 0 "$src" -o "$dest" 2>/dev/null || true
    local bytes
    bytes=$(stat -c%s "$dest" 2>/dev/null || echo "0")
    log "  Transformed (resized): $target_name ($bytes bytes)"
    state_update_file "$drive_id" "transformed" "$bytes"
    return 0
  fi

  state_update_file "$drive_id" "failed" 0 "Transform failed"
  return 1
}

step_upload() {
  local drive_id="$1"
  local folder="$2"
  local target_name="$3"
  local cdn_path="$4"

  local src="$WORK_DIR/processed/GRS - FOTOS _ CLUB/$folder/$target_name"
  local encoded_path
  encoded_path=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$cdn_path', safe='/'))")

  local http_code
  http_code=$(curl -s -o /dev/null -w "%{http_code}" \
    -X PUT \
    -H "AccessKey: $BUNNY_KEY" \
    -H "Content-Type: application/octet-stream" \
    -H "accept: application/json" \
    --data-binary @"$src" \
    "${BUNNY_API}/${BUNNY_ZONE}/${encoded_path}")

  if [ "$http_code" = "201" ] || [ "$http_code" = "200" ]; then
    local bytes
    bytes=$(stat -c%s "$src" 2>/dev/null || echo "0")
    log "  Uploaded: $cdn_path ($bytes bytes)"
    state_update_file "$drive_id" "uploaded" "$bytes"
    return 0
  fi

  state_update_file "$drive_id" "failed" 0 "Upload failed (HTTP $http_code)"
  return 1
}

# ─── Main pipeline loop ────────────────────────────────────────────────────

run_pipeline() {
  load_env
  state_init

  # ── Reconciliation: skip files already processed in previous runs ──
  # Check BunnyCDN for already-uploaded files, then check local disk.
  reconcile_state() {
    local reconciled=0

    # For each file in state, check if it exists on BunnyCDN
    local all_ids
    all_ids=$(jq -r '.files | keys[]' "$STATE_FILE")

    while IFS= read -r drive_id; do
      [ -z "$drive_id" ] && continue
      local current_status
      current_status=$(jq -r --arg id "$drive_id" '.files[$id].status' "$STATE_FILE")
      [ "$current_status" = "uploaded" ] && continue

      local cdn_path
      cdn_path=$(jq -r --arg id "$drive_id" '.files[$id].cdn_path' "$STATE_FILE")
      local encoded_path
      encoded_path=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$cdn_path', safe='/'))" 2>/dev/null)

      # Check BunnyCDN
      local http_code
      http_code=$(curl -s -o /dev/null -w "%{http_code}" \
        -H "AccessKey: $BUNNY_KEY" -H "accept: application/json" \
        "${BUNNY_API}/${BUNNY_ZONE}/${encoded_path}" 2>/dev/null)

      if [ "$http_code" = "200" ]; then
        local bytes
        bytes=$(curl -sI -H "AccessKey: $BUNNY_KEY" "${BUNNY_API}/${BUNNY_ZONE}/${encoded_path}" 2>/dev/null \
          | grep -i content-length | awk '{print $2}' | tr -d '\r' || echo "0")
        state_update_file "$drive_id" "uploaded" "${bytes:-0}"
        reconciled=$((reconciled + 1))
        log "  Reconciled (CDN): $cdn_path → uploaded"
        continue
      fi

      # Check local processed file
      local folder target_name
      folder=$(jq -r --arg id "$drive_id" '.files[$id].folder' "$STATE_FILE")
      target_name=$(jq -r --arg id "$drive_id" '.files[$id].target_name' "$STATE_FILE")
      local proc_file="$WORK_DIR/processed/GRS - FOTOS _ CLUB/$folder/$target_name"

      if [ -f "$proc_file" ]; then
        local bytes
        bytes=$(stat -c%s "$proc_file" 2>/dev/null || echo "0")
        state_update_file "$drive_id" "transformed" "$bytes"
        reconciled=$((reconciled + 1))
        log "  Reconciled (processed): $target_name → transformed"
        continue
      fi

      # Check local raw file
      local original_name
      original_name=$(jq -r --arg id "$drive_id" '.files[$id].original_name' "$STATE_FILE")
      local raw_file="$WORK_DIR/raw/GRS - FOTOS _ CLUB/$folder/$original_name"

      if [ -f "$raw_file" ] && file "$raw_file" | grep -qiE "image|video"; then
        local bytes
        bytes=$(stat -c%s "$raw_file" 2>/dev/null || echo "0")
        state_update_file "$drive_id" "downloaded" "$bytes"
        reconciled=$((reconciled + 1))
        log "  Reconciled (raw): $original_name → downloaded"
      fi
    done <<< "$all_ids"

    log "Reconciled $reconciled files from previous runs"
  }

  reconcile_state

  # Process pipeline stages: download → transform → upload
  local processed=0

  # Stage 1: Download pending files
  local pending_ids
  pending_ids=$(jq -r --argjson max "$MAX_RETRIES" \
    '.files | to_entries[] | select(.value.status == "pending" and .value.retries < $max) | .key' \
    "$STATE_FILE" 2>/dev/null)

  if [ -n "$pending_ids" ]; then
    log "=== Stage 1: Downloading pending files ==="
    while IFS= read -r drive_id; do
      [ -z "$drive_id" ] && continue

      if [ "$processed" -ge "$BATCH_SIZE" ]; then
        log "Batch limit ($BATCH_SIZE) reached. Pausing for ${DELAY_BETWEEN_BATCHES}s..."
        sleep "$DELAY_BETWEEN_BATCHES"
        processed=0
      fi

      local info
      info=$(jq -r --arg id "$drive_id" '.files[$id] | "\(.folder)|\(.original_name)|\(.target_name)|\(.is_video)|\(.cdn_path)"' "$STATE_FILE")
      IFS='|' read -r folder original_name target_name is_video cdn_path <<< "$info"

      log "Downloading: $original_name"
      step_download "$drive_id" "$folder" "$original_name" || true
      processed=$((processed + 1))
      sleep "$DELAY_BETWEEN_FILES"
    done <<< "$pending_ids"
  fi

  # Stage 2: Transform downloaded files
  local downloaded_ids
  downloaded_ids=$(jq -r '.files | to_entries[] | select(.value.status == "downloaded") | .key' "$STATE_FILE" 2>/dev/null)

  if [ -n "$downloaded_ids" ]; then
    log "=== Stage 2: Transforming downloaded files ==="
    while IFS= read -r drive_id; do
      [ -z "$drive_id" ] && continue

      local info
      info=$(jq -r --arg id "$drive_id" '.files[$id] | "\(.folder)|\(.original_name)|\(.target_name)|\(.is_video)"' "$STATE_FILE")
      IFS='|' read -r folder original_name target_name is_video <<< "$info"

      log "Transforming: $original_name → $target_name"
      step_transform "$drive_id" "$folder" "$original_name" "$target_name" "$is_video" || true
    done <<< "$downloaded_ids"
  fi

  # Stage 3: Upload transformed files
  local transformed_ids
  transformed_ids=$(jq -r '.files | to_entries[] | select(.value.status == "transformed") | .key' "$STATE_FILE" 2>/dev/null)

  if [ -n "$transformed_ids" ]; then
    log "=== Stage 3: Uploading to BunnyCDN ==="
    while IFS= read -r drive_id; do
      [ -z "$drive_id" ] && continue

      local info
      info=$(jq -r --arg id "$drive_id" '.files[$id] | "\(.folder)|\(.target_name)|\(.cdn_path)"' "$STATE_FILE")
      IFS='|' read -r folder target_name cdn_path <<< "$info"

      log "Uploading: $target_name → $cdn_path"
      step_upload "$drive_id" "$folder" "$target_name" "$cdn_path" || true
      sleep 0.3
    done <<< "$transformed_ids"
  fi

  # Summary
  log "=== Pipeline run complete ==="
  show_status
}

# ─── Retry command ─────────────────────────────────────────────────────────

retry_failed() {
  load_env
  if [ ! -f "$STATE_FILE" ]; then
    err "No state file. Run with --init first."
    exit 1
  fi

  log "Resetting failed files to pending..."
  jq '(.files[] | select(.status == "failed")) |= . + {"status": "pending"}' \
    "$STATE_FILE" > "${STATE_FILE}.tmp" && mv "${STATE_FILE}.tmp" "$STATE_FILE"

  local count
  count=$(jq '[.files[] | select(.status == "pending")] | length' "$STATE_FILE")
  log "Reset $count files to pending. Run pipeline to process them."
}

# ─── CLI ────────────────────────────────────────────────────────────────────

case "${1:-run}" in
  --init)   load_env; state_init; show_status ;;
  --status) show_status ;;
  --retry)  retry_failed ;;
  --all)    BATCH_SIZE=9999 run_pipeline ;;
  run)      run_pipeline ;;
  *)
    echo "Usage: $0 [--init|--status|--retry|--all|run]"
    echo ""
    echo "Commands:"
    echo "  run       Process next batch (default)"
    echo "  --init    Bootstrap state.json from Google Drive"
    echo "  --status  Show progress"
    echo "  --retry   Reset all failed files to pending"
    echo "  --all     Process everything in one run"
    echo ""
    echo "Cron example (every 10 min):"
    echo "  */10 * * * * $0 >> $LOG_FILE 2>&1"
    exit 1
    ;;
esac
