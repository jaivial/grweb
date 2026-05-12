import { useMemo, type ComponentType, type CSSProperties } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { useLocation } from 'wouter';
import { FER_COLORS } from '../constants';
import { Head } from '../../../components/Head';

interface PagePlaceholderProps {
  title: string;
  description?: string;
  icon?: ComponentType<{ size?: number; style?: CSSProperties; 'data-ui'?: string }>;
}

export function PagePlaceholder({ title, description, icon: Icon }: PagePlaceholderProps) {
  const [, navigate] = useLocation();

  const iconElement = useMemo(() => {
    if (!Icon) return null;
    return <Icon size={48} style={{ color: FER_COLORS.accent }} data-ui="page-placeholder-icon" />;
  }, [Icon]);

  return (
    <>
      <Head title={`${title} | FER CUP`} description={description} />
      <div
        className="min-h-screen flex flex-col items-center justify-center px-4"
        style={{ backgroundColor: FER_COLORS.bgDark }}
        data-ui="page-placeholder"
      >
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center max-w-lg"
          data-ui="page-placeholder-content"
        >
          {iconElement && (
            <div className="mb-6" data-ui="page-placeholder-icon-wrapper">
              {iconElement}
            </div>
          )}
          <h1
            className="text-3xl sm:text-4xl font-black mb-4"
            style={{ color: FER_COLORS.text }}
            data-ui="page-placeholder-title"
          >
            {title}
          </h1>
          {description && (
            <p
              className="text-base sm:text-lg mb-10"
              style={{ color: FER_COLORS.textMuted }}
              data-ui="page-placeholder-description"
            >
              {description}
            </p>
          )}
          <div
            className="w-16 h-1 mx-auto mb-10 rounded-full"
            style={{ backgroundColor: FER_COLORS.accent }}
            data-ui="page-placeholder-divider"
          />
          <button
            onClick={() => navigate('/')}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-sm font-medium transition-colors hover:opacity-90"
            style={{
              backgroundColor: `${FER_COLORS.accent}20`,
              color: FER_COLORS.accent,
              border: `1px solid ${FER_COLORS.accent}30`,
            }}
            data-ui="page-placeholder-back-button"
          >
            <ArrowLeft size={16} data-ui="page-placeholder-back-icon" />
            <span data-ui="page-placeholder-back-text">Volver al inicio</span>
          </button>
        </motion.div>
      </div>
    </>
  );
}
