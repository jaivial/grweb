// FER Tutorial Videos - hosted on BunnyCDN
// Compressed from 4K source to 720p H.264, max 1.5MB each

export interface TutorialVideo {
  id: string;
  title: string;
  description: string;
  url: string;
  hashtags?: string;
  thumbnail?: string;
}

export const TUTORIAL_VIDEOS: TutorialVideo[] = [
  {
    id: 'video-0508',
    title: 'Tutorial 0508',
    description: 'Video tutorial 0508',
    url: 'https://jaimedigitalstudio.b-cdn.net/fer/videos/0508(1).mp4',
  },
  {
    id: 'video-0509',
    title: 'Tutorial 0509',
    description: 'Video tutorial 0509',
    url: 'https://jaimedigitalstudio.b-cdn.net/fer/videos/0509.mp4',
  },
  {
    id: 'video-0512',
    title: 'Tutorial 0512',
    description: 'Video tutorial 0512',
    url: 'https://jaimedigitalstudio.b-cdn.net/fer/videos/0512.mp4',
  },
  {
    id: 'video-0513',
    title: 'Tutorial 0513',
    description: 'Video tutorial 0513',
    url: 'https://jaimedigitalstudio.b-cdn.net/fer/videos/0513.mp4',
  },
];

// CDN Base URL
export const CDN_BASE_URL = 'https://jaimedigitalstudio.b-cdn.net';

// Video paths
export const VIDEO_PATHS = {
  '0508': '/fer/videos/0508(1).mp4',
  '0509': '/fer/videos/0509.mp4',
  '0512': '/fer/videos/0512.mp4',
  '0513': '/fer/videos/0513.mp4',
} as const;

export type VideoKey = keyof typeof VIDEO_PATHS;

// Get full CDN URL for a video
export function getVideoUrl(key: VideoKey): string {
  return `${CDN_BASE_URL}${VIDEO_PATHS[key]}`;
}
