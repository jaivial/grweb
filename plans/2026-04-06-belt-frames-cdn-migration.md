{
  "name": "Belt Frames CDN Migration",
  "description": "Migrate belt frame images from localhost to BunnyCDN with cache optimization",
  "tasks": [
    {
      "id": 1,
      "title": "Update frameSources.ts - Add belt CDN configuration",
      "file": "frontend/src/utils/frameSources.ts",
      "description": "Add BUNNYCDN_BELT_BASE constant and update BELT_FRAMES_CONFIG to use 'cdn' source type instead of 'local'. Use the BunnyCDN base URL: https://storage.bunnycdn.com/grcup/frames/compressedbeltimages/",
      "changes": [
        {
          "type": "add",
          "content": "export const BUNNYCDN_BELT_BASE = 'https://storage.bunnycdn.com/grcup/frames/compressedbeltimages';"
        },
        {
          "type": "modify",
          "old": "export const BELT_FRAMES_CONFIG: LocalFrameConfig = {\n  source: 'local',\n  path: BELT_PATH,\n  startFrame: 1,\n  endFrame: 845,\n  order: 'asc',\n};",
          "new": "export const BELT_FRAMES_CONFIG: CdnFrameConfig = {\n  source: 'cdn',\n  baseUrl: BUNNYCDN_BELT_BASE,\n  startFrame: 1,\n  endFrame: 845,\n  order: 'asc',\n};"
        }
      ]
    },
    {
      "id": 2,
      "title": "Update RaffleFrames.tsx - Apply cache optimization",
      "file": "frontend/src/pages/raffle/RaffleFrames.tsx",
      "description": "Apply cache optimization pattern from HeroSection: add cache headers via link preload, ensure batch loading with batchSize: 20 and batchDelay: 50, and add DNS prefetch for BunnyCDN domain.",
      "changes": [
        {
          "type": "add",
          "content": "// Add in component or via useEffect:\n// - Preload first frames immediately\n// - Use batch loading (batchSize: 20, batchDelay: 50)\n// - Add DNS prefetch for storage.bunnycdn.com"
        }
      ]
    },
    {
      "id": 3,
      "title": "Verify RaffleFrames.tsx imports",
      "file": "frontend/src/pages/raffle/RaffleFrames.tsx",
      "description": "Ensure RaffleFrames.tsx imports CdnFrameConfig type if needed for proper type safety",
      "changes": []
    }
  ],
  "bunnyCDN": {
    "baseUrl": "https://storage.bunnycdn.com/grcup/frames/compressedbeltimages",
    "frameCount": 845,
    "framePattern": "frame_000001.webp to frame_000845.webp"
  },
  "cacheOptimization": {
    "batchSize": 20,
    "batchDelay": 50,
    "dnsPrefetch": "storage.bunnycdn.com"
  }
}
