import { signal, computed } from '@preact/signals-react';

// Participant count state
export const participantCount = signal(0);
export const isLoadingCount = signal(false);
export const countError = signal<string | null>(null);

// Participant count computed values
export const formattedCount = computed(() => 
  participantCount.value.toLocaleString()
);

export const hasParticipants = computed(() => participantCount.value > 0);

// Scroll section visibility
export const activeSection = signal<string>('hero');
export const sectionVisibility = signal<Record<string, number>>({
  hero: 0,
  rules: 0,
  howToEnter: 0,
  winners: 0,
});

// Animation states
export const isHeroVisible = signal(false);
export const isRulesVisible = signal(false);
export const isHowToEnterVisible = signal(false);
export const isWinnersVisible = signal(false);

// Loading states for each section
export const heroLoaded = signal(false);
export const rulesLoaded = signal(false);
export const howToEnterLoaded = signal(false);
export const winnersLoaded = signal(false);

// Frame loading states
export const heroFrameProgress = signal(0);
export const rulesFrameProgress = signal(0);
export const howToEnterFrameProgress = signal(0);
export const winnersFrameProgress = signal(0);

// Actions
export function setParticipantCount(count: number) {
  participantCount.value = count;
}

export function setActiveSection(section: string) {
  activeSection.value = section;
}

export function updateSectionVisibility(section: string, visibility: number) {
  sectionVisibility.value = {
    ...sectionVisibility.value,
    [section]: visibility,
  };
}

export function setSectionLoaded(section: 'hero' | 'rules' | 'howToEnter' | 'winners', loaded: boolean) {
  switch (section) {
    case 'hero':
      heroLoaded.value = loaded;
      break;
    case 'rules':
      rulesLoaded.value = loaded;
      break;
    case 'howToEnter':
      howToEnterLoaded.value = loaded;
      break;
    case 'winners':
      winnersLoaded.value = loaded;
      break;
  }
}

export function setFrameProgress(section: 'hero' | 'rules' | 'howToEnter' | 'winners', progress: number) {
  switch (section) {
    case 'hero':
      heroFrameProgress.value = progress;
      break;
    case 'rules':
      rulesFrameProgress.value = progress;
      break;
    case 'howToEnter':
      howToEnterFrameProgress.value = progress;
      break;
    case 'winners':
      winnersFrameProgress.value = progress;
      break;
  }
}
