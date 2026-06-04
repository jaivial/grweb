import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { FER_COLORS } from '../constants';
import type { FaqItem } from '../constants/faq';

interface FaqAccordionProps {
  items: FaqItem[];
}

function slugifyFaqLabel(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function FaqAccordion({ items }: FaqAccordionProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mq.matches);
    const handler = (event: MediaQueryListEvent) => setPrefersReducedMotion(event.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const toggleItem = useCallback((index: number) => {
    setOpenIndex((current) => (current === index ? null : index));
  }, []);

  const panelVariants = useMemo(
    () =>
      prefersReducedMotion
        ? {
            closed: { opacity: 0 },
            open: { opacity: 1 },
          }
        : {
            closed: { opacity: 0, height: 0 },
            open: { opacity: 1, height: 'auto' },
          },
    [prefersReducedMotion]
  );

  return (
    <div className="space-y-3 sm:space-y-4" data-ui="faq-accordion-list">
      {items.map((item, index) => {
        const isOpen = openIndex === index;
        const faqId = slugifyFaqLabel(item.question) || `faq-item-${index + 1}`;

        return (
          <article
            key={item.question}
            className="overflow-hidden rounded-2xl border"
            style={{
              backgroundColor: `${FER_COLORS.bgCard}d9`,
              borderColor: `${FER_COLORS.accent}18`,
            }}
            data-ui={`faq-accordion-item-${faqId}`}
          >
            <button
              type="button"
              onClick={() => toggleItem(index)}
              className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left sm:px-6 sm:py-5"
              data-ui={`faq-accordion-trigger-${faqId}`}
              aria-expanded={isOpen}
              aria-controls={`faq-panel-${faqId}`}
              id={`faq-trigger-${faqId}`}
            >
              <span
                className="text-sm font-semibold leading-snug sm:text-base"
                style={{ color: FER_COLORS.text }}
                data-ui={`faq-accordion-question-${faqId}`}
              >
                {item.question}
              </span>
              <span
                className="flex h-9 w-9 flex-none items-center justify-center rounded-full border transition-colors duration-300"
                style={{
                  borderColor: isOpen ? `${FER_COLORS.gold}40` : `${FER_COLORS.accent}20`,
                  backgroundColor: isOpen ? `${FER_COLORS.gold}12` : `${FER_COLORS.accent}10`,
                  color: isOpen ? FER_COLORS.gold : FER_COLORS.textMuted,
                }}
                data-ui={`faq-accordion-icon-wrap-${faqId}`}
                aria-hidden="true"
              >
                <motion.span
                  animate={{ rotate: isOpen ? 180 : 0 }}
                  transition={{ duration: 0.22, ease: 'easeOut' }}
                  className="inline-flex"
                  data-ui={`faq-accordion-icon-${faqId}`}
                >
                  <ChevronDown size={18} />
                </motion.span>
              </span>
            </button>

            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  key={`faq-panel-${faqId}`}
                  initial={panelVariants.closed}
                  animate={panelVariants.open}
                  exit={panelVariants.closed}
                  transition={{ duration: prefersReducedMotion ? 0.15 : 0.28, ease: 'easeOut' }}
                  className="overflow-hidden"
                  id={`faq-panel-${faqId}`}
                  role="region"
                  aria-labelledby={`faq-trigger-${faqId}`}
                  data-ui={`faq-accordion-panel-${faqId}`}
                >
                  <div
                    className="px-4 pb-4 pt-0 sm:px-6 sm:pb-6"
                    data-ui={`faq-accordion-panel-inner-${faqId}`}
                  >
                    <div
                      className="mb-4 h-px w-full"
                      style={{ backgroundColor: `${FER_COLORS.accent}18` }}
                      aria-hidden="true"
                      data-ui={`faq-accordion-divider-${faqId}`}
                    />

                    <div
                      className="space-y-3 text-sm leading-relaxed sm:text-[15px]"
                      data-ui={`faq-accordion-answer-${faqId}`}
                    >
                      {item.answer.map((block, blockIndex) => {
                        if (block.type === 'paragraph') {
                          return (
                            <p
                              key={`${faqId}-paragraph-${blockIndex}`}
                              className="m-0"
                              style={{ color: FER_COLORS.textMuted }}
                              data-ui={`faq-accordion-answer-paragraph-${faqId}-${blockIndex}`}
                            >
                              {block.text}
                            </p>
                          );
                        }

                        return (
                          <ul
                            key={`${faqId}-list-${blockIndex}`}
                            className="space-y-2 pl-5"
                            style={{ color: FER_COLORS.textMuted }}
                            data-ui={`faq-accordion-answer-list-${faqId}-${blockIndex}`}
                          >
                            {block.items.map((itemText, listIndex) => (
                              <li
                                key={`${faqId}-list-${blockIndex}-${listIndex}`}
                                className="list-disc"
                                data-ui={`faq-accordion-answer-list-item-${faqId}-${blockIndex}-${listIndex}`}
                              >
                                {itemText}
                              </li>
                            ))}
                          </ul>
                        );
                      })}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </article>
        );
      })}
    </div>
  );
}

export default FaqAccordion;
