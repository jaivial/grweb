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

const CDN_BASE = 'https://jaimedigitalstudio.b-cdn.net/grcup/frames/trophy_frames_webp';
const LOCAL_PATH = '/trophy';
const BELT_PATH = '/compressedbeltimages';

// Belt frames configuration - 845 frames in ascending order
export const BELT_FRAMES_CONFIG: LocalFrameConfig = {
  source: 'local',
  path: BELT_PATH,
  startFrame: 1,
  endFrame: 845,
  order: 'asc',
};

function padFrame(n: number): string {
  return String(n).padStart(6, '0');
}

export function generateFrameUrls(config: FrameConfig): string[] {
  if (config.source === 'cdn') {
    const {
      baseUrl = CDN_BASE,
      startFrame = 783,
      endFrame = 1,
      order = 'desc',
    } = config;

    const urls: string[] = [];
    if (order === 'desc') {
      for (let i = startFrame; i >= endFrame; i--) {
        urls.push(`${baseUrl}/frame_${padFrame(i)}.webp`);
      }
    } else {
      for (let i = endFrame; i <= startFrame; i++) {
        urls.push(`${baseUrl}/frame_${padFrame(i)}.webp`);
      }
    }
    return urls;
  }

  // Local
  const { path = LOCAL_PATH, startFrame = 1, endFrame = 783 } = config;
  const urls: string[] = [];
  for (let i = startFrame; i <= endFrame; i++) {
    urls.push(`${path}/frame_${padFrame(i)}.webp`);
  }
  return urls;
}

export function getFrameSourceInfo(config: FrameConfig): {
  totalFrames: number;
  label: string;
} {
  if (config.source === 'cdn') {
    const start = config.startFrame ?? 783;
    const end = config.endFrame ?? 1;
    return {
      totalFrames: Math.abs(start - end) + 1,
      label: `CDN (${start}-${end})`,
    };
  }

  const start = config.startFrame ?? 1;
  const end = config.endFrame ?? 783;
  return {
    totalFrames: end - start + 1,
    label: `Local (${start}-${end})`,
  };
}
