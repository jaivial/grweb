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
  /** Number of zero-padding digits for frame filenames. Default: 6 */
  digits?: number;
}

export type FrameConfig = LocalFrameConfig | CdnFrameConfig;

const CDN_BASE = 'https://jaimedigitalstudio.b-cdn.net/grcup/frames/trophy_frames_webp';
const LOCAL_PATH = '/trophy';

// Belt frames: 169 webp frames from belt_output_webp folder, 6-digit padding
export const BUNNYCDN_BELT_BASE = 'https://jaimedigitalstudio.b-cdn.net/grcup/frames/belt_output_webp';

export const BELT_FRAMES_CONFIG: CdnFrameConfig = {
  source: 'cdn',
  baseUrl: BUNNYCDN_BELT_BASE,
  startFrame: 1,
  endFrame: 169,
  order: 'asc',
  digits: 6,
};

function padFrame(n: number, digits: number = 6): string {
  return String(n).padStart(digits, '0');
}

export function generateFrameUrls(config: FrameConfig): string[] {
  const digits = 'digits' in config ? (config as CdnFrameConfig).digits : 6;
  if (config.source === 'cdn') {
    const {
      baseUrl = CDN_BASE,
      startFrame = 1,
      endFrame = 783,
      order = 'asc',
    } = config;

    const urls: string[] = [];
    const minFrame = Math.min(startFrame, endFrame);
    const maxFrame = Math.max(startFrame, endFrame);

    if (order === 'desc') {
      for (let i = maxFrame; i >= minFrame; i--) {
        urls.push(`${baseUrl}/frame_${padFrame(i, digits)}.webp`);
      }
    } else {
      for (let i = minFrame; i <= maxFrame; i++) {
        urls.push(`${baseUrl}/frame_${padFrame(i, digits)}.webp`);
      }
    }
    return urls;
  }

  // Local
  const { path = LOCAL_PATH, startFrame = 1, endFrame = 783 } = config;
  const urls: string[] = [];
  for (let i = startFrame; i <= endFrame; i++) {
    urls.push(`${path}/frame_${padFrame(i, digits)}.webp`);
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
