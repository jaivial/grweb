// Home page types

export interface ParticipantCount {
  count: number;
}

export interface NavItem {
  label: string;
  href: string;
}

export interface StatItem {
  value: string | number;
  label: string;
  icon?: string;
}

export interface RaffleRule {
  icon: string;
  title: string;
  description: string;
}

export interface HowToEnterStep {
  number: number;
  title: string;
  description: string;
}

export interface Winner {
  name: string;
  instagram: string;
  tickets: number;
}

export interface HomePageSection {
  id: string;
  title: string;
  subtitle?: string;
}

export interface AnimatedSection {
  id: string;
  frameCount: number;
  frameFolder: string;
  parallaxLayers: ParallaxLayer[];
}

export interface ParallaxLayer {
  id: string;
  content: string;
  speed: number;
  position: 'top' | 'center' | 'bottom';
}

export interface ScrollProgress {
  section: string;
  progress: number;
  currentFrame: number;
}

export interface FramePreloadState {
  isLoaded: boolean;
  loadedFrames: number;
  totalFrames: number;
  progress: number;
}
