import { useState, useEffect, useRef, useCallback } from 'react';
import { signal } from '@preact/signals-react';

/**
 * Scroll progress state
 */
export const scrollProgress = signal({
  hero: 0,
  rules: 0,
  howToEnter: 0,
  winners: 0,
});

/**
 * Scroll progress hook
 * Tracks scroll progress for each animated section
 */
export function useScrollProgress(sectionId: string, sectionRef: HTMLElement | null) {
  const [progress, setProgress] = useState(0);
  const rafRef = useRef<number | null>(null);

  const handleScroll = useCallback(() => {
    if (!sectionRef) return;

    // Cancel any pending animation frame
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }

    // Use requestAnimationFrame for smooth updates
    rafRef.current = requestAnimationFrame(() => {
      const rect = sectionRef.getBoundingClientRect();
      const windowHeight = window.innerHeight;
      
      // Calculate progress based on how much of section is visible
      // 0 = section is above viewport, 1 = section has passed viewport
      const sectionTop = rect.top;
      const sectionHeight = rect.height;
      
      // Progress calculation:
      // When section is fully above viewport: progress < 0
      // When section center aligns with viewport center: progress = 0.5
      // When section is fully below viewport: progress > 1
      const progressValue = (windowHeight / 2 - sectionTop) / (windowHeight / 2 + sectionHeight / 2);
      
      // Clamp between 0 and 1 for the animation
      const clampedProgress = Math.max(0, Math.min(1, progressValue));
      
      setProgress(clampedProgress);
      
      // Update global scroll progress
      scrollProgress.value = {
        ...scrollProgress.value,
        [sectionId]: clampedProgress,
      };
    });
  }, [sectionId, sectionRef]);

  useEffect(() => {
    if (!sectionRef) return;

    // Initial calculation
    handleScroll();

    // Add scroll listener
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [sectionRef, handleScroll]);

  return progress;
}

/**
 * Calculates the current frame number based on scroll progress
 */
export function calculateFrameNumber(
  progress: number,
  totalFrames: number
): number {
  // Ensure progress is between 0 and 1
  const clampedProgress = Math.max(0, Math.min(1, progress));
  
  // Calculate frame index (0-based)
  const frameIndex = Math.floor(clampedProgress * (totalFrames - 1));
  
  // Return 1-based frame number
  return Math.max(1, Math.min(totalFrames, frameIndex + 1));
}

/**
 * Pads a number with leading zeros
 */
export function padFrameNumber(num: number, totalFrames: number): string {
  const digits = String(totalFrames).length;
  return String(num).padStart(digits, '0');
}
