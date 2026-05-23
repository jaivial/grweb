---
name: bunnycdn
description: Manage BunnyCDN storage assets, public CDN URLs, cache purging, and GR Platform media path conventions. Use when listing, uploading, downloading, deleting, or publishing assets for GR Cup or FER via BunnyCDN MCP tools.
---

# BunnyCDN Skill

## Overview
Manage assets on BunnyCDN for the GR Platform. This skill provides direct access to BunnyCDN storage and API operations through MCP tools.

## Configuration
- **Storage Zone**: `jaimedigitalstudio`
- **Pull Zone URL**: `https://jaimedigitalstudio.b-cdn.net`
- **Project paths**: `/grcup/` (GR Cup), `/fer/` (FER)

## MCP Tools Available

### File Operations
| Tool | Description |
|------|-------------|
| `bunny_list_files` | List files and folders at a storage path |
| `bunny_upload_file` | Upload a local file to storage |
| `bunny_upload_buffer` | Upload base64-encoded data to storage |
| `bunny_download_file` | Download a file as base64 |
| `bunny_delete_file` | Delete a file from storage |
| `bunny_get_url` | Get the public CDN URL for a path |
| `bunny_storage_usage` | Get file count and total size for a path |

### Cache & Zones
| Tool | Description |
|------|-------------|
| `bunny_list_pullzones` | List all pull zones |
| `bunny_purge_cache` | Purge cache for a pull zone |

## Storage Path Conventions

```
/grcup/
├── frames/                  # Scroll animation frames
│   └── trophy_frames_webp/  # WebP frames (001.webp ...)
├── images/                  # General images
├── logos/                   # Logos (grcuplogo.png)
├── videos/                  # Videos
├── customGifts/             # Raffle gift images
└── athletes/                # Athlete photos

/fer/
├── images/                  # FER-specific images
├── logos/                   # FER logo
└── videos/                  # FER videos
```

## Usage Patterns

### Upload an image
```
1. bunny_upload_file({ localPath: "/path/to/image.webp", remotePath: "/grcup/images/hero.webp" })
2. Response includes cdnUrl: "https://jaimedigitalstudio.b-cdn.net/grcup/images/hero.webp"
```

### List files in a folder
```
bunny_list_files({ path: "/grcup/frames/trophy_frames_webp" })
```

### Purge cache after update
```
1. bunny_list_pullzones() → get pullZoneId
2. bunny_purge_cache({ pullZoneId: <id> })
```

### Delete and replace an asset
```
1. bunny_delete_file({ path: "/grcup/images/old-banner.webp" })
2. bunny_upload_file({ localPath: "...", remotePath: "/grcup/images/new-banner.webp" })
3. bunny_purge_cache({ pullZoneId: <id> })
```

## File Naming Rules
- Use kebab-case: `hero-banner.webp`, `athlete-photo-001.jpg`
- Include timestamp prefix for uploads: `1715300000_photo.webp`
- Max filename: 30 chars before extension
- Preferred format: WebP for images, MP4 for video
- Frame naming: `frame_0001.webp` (4-digit padding)

## Important Rules
- Always purge cache after uploading updated files
- Use `bunny_get_url` to construct CDN URLs — never hardcode storage URLs
- Images should be optimized before upload (WebP, compressed)
- Storage path must NOT start with storage zone name (it's already configured)
- When working with `backend/GrCup.Api/Services/BunnyCdnService.cs`, ensure consistency with these paths
