import { useState, useEffect, useRef } from 'react';

/**
 * Animated counter hook
 * Animates a number from 0 to target value
 */
export function useAnimatedCounter(
  target: number,
  duration: number = 2000,
  shouldAnimate: boolean = true
): number {
  const [count, setCount] = useState(0);
  const startTimeRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!shouldAnimate) {
      setCount(target);
      return;
    }

    // Start animation
    startTimeRef.current = performance.now();
    
    const animate = (currentTime: number) => {
      if (!startTimeRef.current) return;

      const elapsed = currentTime - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);

      // Easing function (ease-out)
      const easeOut = 1 - Math.pow(1 - progress, 3);
      
      const currentCount = Math.floor(easeOut * target);
      setCount(currentCount);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      }
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [target, duration, shouldAnimate]);

  return count;
}

/**
 * Format number with animation support
 */
export function useCountUp(
  value: number,
  duration: number = 1000
): {
  displayed: string;
  isAnimating: boolean;
} {
  const [displayed, setDisplayed] = useState('0');
  const [isAnimating, setIsAnimating] = useState(false);
  const prevValueRef = useRef(value);
  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    const startValue = prevValueRef.current;
    const diff = value - startValue;

    // If no change, don't animate
    if (diff === 0) {
      setDisplayed(value.toLocaleString());
      return;
    }

    // Start animation
    setIsAnimating(true);
    startTimeRef.current = performance.now();

    const animate = (currentTime: number) => {
      if (!startTimeRef.current) return;

      const elapsed = currentTime - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);

      // Ease out cubic
      const easeOut = 1 - Math.pow(1 - progress, 3);
      
      const currentValue = Math.floor(startValue + diff * easeOut);
      setDisplayed(currentValue.toLocaleString());

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        setDisplayed(value.toLocaleString());
        setIsAnimating(false);
        prevValueRef.current = value;
      }
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [value, duration]);

  return { displayed, isAnimating };
}

/**
 * Random number generator with weighted selection
 */
export function useWeightedRandom(
  weights: number[],
  interval: number = 100
): number | null {
  const [result, setResult] = useState<number | null>(null);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    // Start randomizing
    intervalRef.current = window.setInterval(() => {
      const totalWeight = weights.reduce((sum, w) => sum + w, 0);
      let random = Math.random() * totalWeight;
      
      for (let i = 0; i < weights.length; i++) {
        random -= weights[i];
        if (random <= 0) {
          setResult(i);
          break;
        }
      }
    }, interval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [weights, interval]);

  return result;
}
