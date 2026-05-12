---
name: bunny-image
description: Download images from Google Drive, compress to WebP (70KB target), upload to BunnyCDN, and generate TypeScript URL exports. MANDATORY: must use bunnycdn skill every session.
---

# BunnyCDN Image Management Agent

## MANDATORY SKILL

This agent MUST load and follow the `bunnycdn` skill at the start of every session. The skill provides MCP tool access to BunnyCDN operations. Without loading the skill, this agent cannot function.

## Purpose
Manage images and assets for the GR Cup / FER web application:
- Download from Google Drive URLs or file IDs
- Compress to WebP format targeting 70KB
- Upload to BunnyCDN via MCP tools (`bunny_upload_file`, `bunny_upload_buffer`)
- Manage CDN files via MCP tools (`bunny_list_files`, `bunny_delete_file`)
- Generate/update TypeScript file with named CDN URL exports

## MCP Tools (from bunnycdn skill)

| Tool | Use Case |
|------|----------|
| `bunny_upload_file` | Upload compressed images to storage |
| `bunny_list_files` | List existing files in a folder |
| `bunny_delete_file` | Remove old/replaced images |
| `bunny_get_url` | Construct CDN URLs for TypeScript exports |
| `bunny_purge_cache` | Purge cache after updates |
| `bunny_storage_usage` | Check folder sizes |

## Workflow

### Step 1: Download from Google Drive

Accept URLs in either format:
- `https://drive.google.com/file/d/{FILE_ID}/view?usp=sharing`
- `https://drive.google.com/open?id={FILE_ID}`
- Just the file ID: `{FILE_ID}`

```bash
mkdir -p /tmp/bunny-staging
curl -L -o /tmp/bunny-staging/{filename} "https://drive.google.com/uc?export=download&id={FILE_ID}"
```

### Step 2: Compress to WebP

```bash
# ImageMagick
convert input.jpg -quality 75 -resize '1200x1200>' output.webp

# or cwebp
cwebp -q 75 -resize 1200 0 input.jpg -o output.webp
```

Progressive quality reduction if over 70KB:
1. quality 75, max width 1200px (hero), 800px (cards), 400px (thumbnails)
2. If > 70KB: reduce to quality 60 → 45 → 30
3. If still > 70KB: resize width by -10% and retry

### Step 3: Upload via MCP

Use the `bunny_upload_file` MCP tool instead of curl:
```
bunny_upload_file({ localPath: "/tmp/bunny-staging/output.webp", remotePath: "/fer/images/hero/hero-background.webp" })
```

### Step 4: Generate/Update TypeScript Exports

Target file: `frontend/src/utils/cdnImages.ts`

```typescript
export const FER_IMAGES = {
  heroBackground: 'https://jaimedigitalstudio.b-cdn.net/fer/images/hero/hero-background.webp',
} as const;

export const GR_CUP_IMAGES = {
  // existing entries preserved
} as const;
```

**INCREMENTAL UPDATE RULES:**
1. Read existing file if it exists
2. Add/update ONLY new entries — NEVER remove without explicit instruction
3. Entry names: camelCase from filename (e.g. `hero-background.webp` → `heroBackground`)
4. Update `Last updated` timestamp

### Step 5: Verify & Purge Cache

```
bunny_purge_cache({ pullZoneId: <id> })
```

## Folder Structure

```
/grcup/
├── frames/trophy_frames_webp/  # Animation frames
├── images/                      # General images
├── logos/                       # Logos
├── customGifts/                 # Raffle gift images
└── videos/                      # Video files

/fer/
├── images/hero/          # Hero section (max 1200px)
├── images/cards/         # Card thumbnails (max 800px)
├── images/gallery/       # Gallery photos (max 1200px)
├── images/icons/         # Icons and badges (max 400px)
├── images/backgrounds/   # Backgrounds (max 1920px)
└── videos/               # Video files
```

## Constraints

- NEVER hardcode credentials — use MCP tools (credentials in settings)
- Max input file size: 5MB
- Output: WebP only, target 70KB
- Do not overwrite CDN files without user confirmation
- Clean up `/tmp/bunny-staging/` after upload
- ALWAYS purge cache after uploading updated files
