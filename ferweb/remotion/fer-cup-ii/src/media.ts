import {
  FER_CUP_LOGO_IMAGE,
  MEDIA_GENERAL_IMAGES,
  MEDIA_GENERAL_VIDEOS,
} from '../../../src/pages/fer/constants/mediaCdnUrls';

// Hero background — use Ken Burns image from General photos (hero-background.webm does NOT exist on CDN)
const HERO_BACKGROUND_IMAGE = MEDIA_GENERAL_IMAGES[0];

// Lift videos — confirmed working CDN URLs (.webm)
const BP_WEBM = 'https://jaimedigitalstudio.b-cdn.net/fer/media/GRS%20-%20FOTOS%20_%20CLUB/General/BP.webm';
const DL_WEBM = 'https://jaimedigitalstudio.b-cdn.net/fer/media/GRS%20-%20FOTOS%20_%20CLUB/General/DL.webm';
const SQ_WEBM = 'https://jaimedigitalstudio.b-cdn.net/fer/media/GRS%20-%20FOTOS%20_%20CLUB/General/SQ.webm';
const GENERAL_WEBM = 'https://jaimedigitalstudio.b-cdn.net/fer/media/GRS%20-%20FOTOS%20_%20CLUB/General/VID_20241005_151135.webm';

// Montage photos (Ken Burns sections)
const MONTAGE_IMAGES = [
  MEDIA_GENERAL_IMAGES[0],
  MEDIA_GENERAL_IMAGES[7],
  MEDIA_GENERAL_IMAGES[44],
  MEDIA_GENERAL_IMAGES[72],
  MEDIA_GENERAL_IMAGES[127],
].filter(Boolean);

export const FER_CUP_II_MEDIA = {
  logo: FER_CUP_LOGO_IMAGE,
  heroBackgroundImage: HERO_BACKGROUND_IMAGE,
  liftVideos: {
    benchPress: BP_WEBM,
    deadlift: DL_WEBM,
    squat: SQ_WEBM,
    general: GENERAL_WEBM,
  },
  montageImages: MONTAGE_IMAGES,
} as const;