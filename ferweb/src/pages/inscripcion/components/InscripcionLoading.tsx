import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { FER_COLORS } from '../../fer/constants/constants';

export function InscripcionLoading() {
  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ backgroundColor: FER_COLORS.bgDark }}
      data-ui="inscripcion-loading"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="text-center"
        data-ui="inscripcion-loading-content"
      >
        <Loader2
          className="w-12 h-12 animate-spin mx-auto"
          style={{ color: FER_COLORS.accent }}
          data-ui="inscripcion-loading-spinner"
        />
        <p
          className="mt-4 text-sm animate-pulse"
          style={{ color: FER_COLORS.textMuted }}
          data-ui="inscripcion-loading-text"
        >
          Cargando evento...
        </p>
      </motion.div>
    </div>
  );
}
