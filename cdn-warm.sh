#!/bin/bash
# CDN Cache Warm Script for GR Cup Videos
# Warms bunnyCDN cache for video assets

set -e

echo '=== CDN Cache Warm Started at $(date) ==='

# Warm trophy hero video
echo 'Warming trophy_hero_60fps_hq_reversed.mp4...'
curl -s -o /dev/null -w '  HTTP %{http_code} | %{time_total}s | %{size_download} bytes\n'     'https://jaimedigitalstudio.b-cdn.net/grcup/videos/trophy_hero_60fps_hq_reversed.mp4'

# Warm belt hero video
echo 'Warming belt_hero_60fps_hq.mp4...'
curl -s -o /dev/null -w '  HTTP %{http_code} | %{time_total}s | %{size_download} bytes\n'     'https://jaimedigitalstudio.b-cdn.net/grcup/videos/belt/belt_hero_60fps_hq.mp4'

echo '=== CDN Cache Warm Completed at $(date) ==='
