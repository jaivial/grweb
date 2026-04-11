import { useState, useCallback, useMemo, type JSX } from 'react';
import { X, Upload, Loader2 } from 'lucide-react';
import type { FallbackImageProps } from '../../../components/ui/FallbackImage/FallbackImage';

interface GiftData {
  id?: number;
  title: string;
  subtitle: string;
  imageUrl?: string | null;
}

interface GiftModalProps {
  mode: 'create' | 'edit';
  gift?: GiftData | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (formData: FormData) => Promise<void>;
}

export function GiftModal({ mode, gift, isOpen, onClose, onSave }: GiftModalProps): JSX.Element | null {
  const [title, setTitle] = useState(gift?.title || '');
  const [subtitle, setSubtitle] = useState(gift?.subtitle || '');
  const [imagePreview, setImagePreview] = useState<string | null>(gift?.imageUrl || null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [titleError, setTitleError] = useState('');
  const [imageError, setImageError] = useState('');
  const [saving, setSaving] = useState(false);

  const modalTitle = useMemo(() =>
    mode === 'create' ? 'Nuevo Premio' : 'Editar Premio',
    [mode]
  , []);

  const handleImageChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setImageError('');

    if (!file) return;

    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowed.includes(file.type)) {
      setImageError('Solo se permiten archivos de imagen (JPEG, PNG, WebP, GIF)');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setImageError('El archivo no puede superar los 5MB');
      return;
    }

    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => {
      setImagePreview(ev.target?.result as string);
    };
    reader.readAsDataURL(file);
  }, []);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      setTitleError('El título es obligatorio');
      return;
    }

    setTitleError('');
    setSaving(true);

    try {
      const formData = new FormData();
      formData.append('title', title.trim());
      formData.append('subtitle', subtitle.trim());
      if (imageFile) {
        formData.append('image', imageFile);
      }
      if (mode === 'edit' && gift?.id) {
        formData.append('id', String(gift.id));
      }

      await onSave(formData);
      onClose();
    } catch {
    } finally {
      setSaving(false);
    }
  }, [title, subtitle, imageFile, mode, gift, onSave, onClose]);

  const handleClose = useCallback(() => {
    if (!saving) onClose();
  }, [saving, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-2 sm:p-4"
      data-testid="gift-form-modal"
      data-ui="gift-modal-overlay"
    >
      <div
        className="bg-dark-surface border border-white/10 rounded-2xl w-full max-w-2xl max-h-[95vh] overflow-y-auto"
        data-ui="gift-modal-content"
      >
        <div className="sticky top-0 bg-dark-surface border-b border-white/10 px-4 xs:px-6 py-3 xs:py-4 flex items-center justify-between z-10" data-ui="gift-modal-header">
          <h3 className="text-lg xs:text-xl font-bold text-white" data-testid="gift-modal-title" data-ui="gift-modal-title-text">
            {modalTitle}
          </h3>
          <button
            onClick={handleClose}
            disabled={saving}
            className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            data-ui="gift-modal-close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 xs:px-6 space-y-5" data-ui="gift-modal-form">
          <div data-ui="gift-modal-field-title">
            <label className="block text-sm font-medium text-gray-300 mb-1.5" data-ui="gift-title-label">Título *</label>
            <input
              type="text"
              value={title}
              onInput={(e) => {
                setTitle((e.target as HTMLInputElement).value);
                setTitleError('');
              }}
              placeholder="Nombre del premio"
              className="w-full px-4 py-3 min-h-[48px] text-base bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/40 focus:outline-none focus:border-red-accent/50 focus:ring-2 focus:ring-red-accent/20"
              data-testid="gift-title-input"
              data-ui="gift-title-input"
            />
            {titleError && (
              <p className="text-red-400 text-sm mt-1" data-testid="gift-title-error" data-ui="gift-title-error-text">{titleError}</p>
            )}
          </div>

          <div data-ui="gift-modal-field-subtitle">
            <label className="block text-sm font-medium text-gray-300 mb-1.5" data-ui="gift-subtitle-label">Subtítulo</label>
            <input
              type="text"
              value={subtitle}
              onInput={(e) => setSubtitle((e.target as HTMLInputElement).value)}
              placeholder="Descripción breve (opcional)"
              className="w-full px-4 py-3 min-h-[48px] text-base bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/40 focus:outline-none focus:border-red-accent/50 focus:ring-2 focus:ring-red-accent/20"
              data-testid="gift-subtitle-input"
              data-ui="gift-subtitle-input"
            />
          </div>

          <div data-ui="gift-modal-field-image">
            <label className="block text-sm font-medium text-gray-300 mb-1.5" data-ui="gift-image-label">Imagen</label>

            {imagePreview ? (
              <div className="relative rounded-xl overflow-hidden mb-3" data-testid="gift-image-preview" data-ui="gift-image-preview-container">
                <img
                  src={imagePreview}
                  alt="Preview"
                  className="w-full h-48 object-cover"
                  data-ui="gift-image-preview-img"
                />
                <button
                  type="button"
                  onClick={() => { setImagePreview(null); setImageFile(null); }}
                  className="absolute top-2 right-2 p-1.5 bg-black/60 rounded-lg hover:bg-black/80 transition-colors"
                  data-ui="gift-image-remove-btn"
                >
                  <X className="w-4 h-4 text-white" />
                </button>
              </div>
            ) : (
              <label
                className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-white/20 rounded-xl cursor-pointer hover:border-white/40 transition-colors"
                data-ui="gift-image-upload-area"
              >
                <Upload className="w-8 h-8 text-gray-500 mb-2" />
                <p className="text-sm text-gray-500" data-ui="gift-image-upload-text">Click para subir imagen</p>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={handleImageChange}
                  className="hidden"
                  data-testid="gift-image-upload"
                  data-ui="gift-image-file-input"
                />
              </label>
            )}

            {imageError && (
              <p className="text-red-400 text-sm mt-1" data-testid="gift-image-error" data-ui="gift-image-error-text">{imageError}</p>
            )}
          </div>

          <div className="flex gap-3 pt-2" data-ui="gift-modal-actions">
            <button
              type="button"
              onClick={handleClose}
              disabled={saving}
              className="flex-1 px-4 py-3 min-h-[44px] text-sm font-medium text-gray-300 bg-white/5 hover:bg-white/[0.08] border border-white/10 rounded-xl transition-colors disabled:opacity-50"
              data-ui="gift-modal-cancel"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-3 min-h-[44px] text-sm font-bold text-white bg-gradient-to-r from-red-accent to-dark-red rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
              data-testid="gift-save-btn"
              data-ui="gift-modal-save"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Guardando...
                </>
              ) : (
                'Guardar'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
