const CDN = 'https://jaimedigitalstudio.b-cdn.net/fer/media/GRS%20-%20FOTOS%20_%20CLUB';

export const CLUB_PHOTOS = {
  hero: {
    main: `${CDN}/Alfonso%20Fern%C3%A1ndez/IMG_7515.webp`,
    secondary: `${CDN}/FERNANDO%20RIPOLL/IMG_7661.webp`,
    featured: `${CDN}/Reme/Remedios%20Martinez%20Iborra-07.webp`,
  },

  action: [
    `${CDN}/Alfonso%20Fern%C3%A1ndez/IMG_7521.webp`,
    `${CDN}/FERNANDO%20RIPOLL/IMG_7663.webp`,
    `${CDN}/General/SR308023.webp`,
    `${CDN}/General/SR306936.webp`,
    `${CDN}/General/IMG_1494.webp`,
    `${CDN}/Reme/Remedios%20Martinez%20Iborra-20.webp`,
    `${CDN}/Rodrigo%20Tello/JUAN.webp`,
    `${CDN}/FOTOS%20AEP%202/SR309912.webp`,
  ],

  portraits: [
    `${CDN}/General/IMG_0572.webp`,
    `${CDN}/General/SR308188.webp`,
    `${CDN}/General/SR306443.webp`,
    `${CDN}/General/SR309553-Editar.webp`,
    `${CDN}/General/SR301283.webp`,
    `${CDN}/Reme/Remedios%20Martinez%20Iborra-32.webp`,
    `${CDN}/Rodrigo%20Tello/JUAN-5.webp`,
    `${CDN}/FOTOS%20AEP%202/SR308662.webp`,
    `${CDN}/Reme/Remedios%20Martinez%20Iborra-09.webp`,
  ],

  gallery: [
    `${CDN}/Alfonso%20Fern%C3%A1ndez/IMG_7522.webp`,
    `${CDN}/FERNANDO%20RIPOLL/IMG_7649.webp`,
    `${CDN}/Reme/Remedios%20Martinez%20Iborra-33.webp`,
    `${CDN}/Rodrigo%20Tello/JUAN-2.webp`,
    `${CDN}/FOTOS%20AEP%202/SR308509.webp`,
    `${CDN}/General/SR306662.webp`,
    `${CDN}/FERNANDO%20RIPOLL/IMG_7655.webp`,
    `${CDN}/Reme/Remedios%20Martinez%20Iborra-05.webp`,
    `${CDN}/FOTOS%20AEP%202/SR309895.webp`,
  ],

  atmosphere: [
    `${CDN}/Reme/Remedios%20Martinez%20Iborra-14.webp`,
    `${CDN}/General/DSC05126.webp`,
    `${CDN}/FOTOS%20AEP%202/SR309407.webp`,
    `${CDN}/Rodrigo%20Tello/JUAN-6.webp`,
  ],

  video: `${CDN}/Videos/video-4be1dcf7.mp4`,

  /** Unique images for ParallaxShowcase — not duplicated in any other component */
  parallax: [
    `${CDN}/FOTOS%20AEP%202/SR308493.webp`,
    `${CDN}/Reme/Remedios%20Martinez%20Iborra-01.webp`,
    `${CDN}/Rodrigo%20Tello/JUAN-11.webp`,
    `${CDN}/Alfonso%20Fern%C3%A1ndez/IMG_3276.webp`,
    `${CDN}/FOTOS%20AEP%202/SR308651.webp`,
    `${CDN}/FERNANDO%20RIPOLL/IMG_7646.webp`,
    `${CDN}/Reme/Remedios%20Martinez%20Iborra-18.webp`,
    `${CDN}/Rodrigo%20Tello/JUAN-15.webp`,
  ],

  /** .webm video for ParallaxShowcase background */
  parallaxVideo: `${CDN}/General/SQ.webm`,
} as const;
