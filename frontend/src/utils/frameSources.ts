export type FrameSource = 'local' | 'cdn';

export interface FrameSourceConfig {
  source: FrameSource;
}

export interface LocalFrameConfig extends FrameSourceConfig {
  source: 'local';
  path?: string;
  startFrame?: number;
  endFrame?: number;
}

export interface CdnFrameConfig extends FrameSourceConfig {
  source: 'cdn';
  baseUrl?: string;
  startFrame?: number;
  endFrame?: number;
  order?: 'asc' | 'desc';
}

export type FrameConfig = LocalFrameConfig | CdnFrameConfig;

const CDN_BASE = 'https://jaimedigitalstudio.b-cdn.net/grcup/frames/trophy';
const LOCAL_PATH = '/trophy';

function padFrame(n: number): string {
  return String(n).padStart(6, '0');
}

export function generateFrameUrls(config: FrameConfig): string[] {
  if (config.source === 'cdn') {
    const {
      baseUrl = CDN_BASE,
      startFrame = 1565,
      endFrame = 829,
      order = 'desc',
    } = config;

    const urls: string[] = [];
    if (order === 'desc') {
      for (let i = startFrame; i >= endFrame; i--) {
        urls.push(`${baseUrl}/frame_${padFrame(i)}.png`);
      }
    } else {
      for (let i = endFrame; i <= startFrame; i++) {
        urls.push(`${baseUrl}/frame_${padFrame(i)}.png`);
      }
    }
    return urls;
  }

  // Local
  const { path = LOCAL_PATH, startFrame = 1, endFrame = 1565 } = config;
  const urls: string[] = [];
  for (let i = startFrame; i <= endFrame; i++) {
    urls.push(`${path}/frame_${padFrame(i)}.png`);
  }
  return urls;
}

export function getFrameSourceInfo(config: FrameConfig): {
  totalFrames: number;
  label: string;
} {
  if (config.source === 'cdn') {
    const start = config.startFrame ?? 1565;
    const end = config.endFrame ?? 829;
    return {
      totalFrames: Math.abs(start - end) + 1,
      label: `CDN (${start}-${end})`,
    };
  }

  const start = config.startFrame ?? 1;
  const end = config.endFrame ?? 1565;
  return {
    totalFrames: end - start + 1,
    label: `Local (${start}-${end})`,
  };
}
