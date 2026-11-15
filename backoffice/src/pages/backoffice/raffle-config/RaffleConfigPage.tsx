import { useEffect, useState, useCallback, useRef, type JSX } from 'react';
import { api } from '../../../utils/api';
import { BackofficeLayout } from '../../../layouts/BackofficeLayout';

interface RaffleConfigData {
  isEnabled: boolean;
  disabledMessage: string | null;
  raffleMethod?: number;
}

interface RaffleProduct {
  id: number;
  title: string;
  subtitle?: string;
  imageMimeType?: string;
  hasImage: boolean;
  displayOrder: number;
  isActive: boolean;
}

export function RaffleConfigPage(): JSX.Element {
  const [config, setConfig] = useState<RaffleConfigData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [messageInput, setMessageInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  
  const [raffleMethod, setRaffleMethod] = useState<'default' | 'custom'>('default');
  const [products, setProducts] = useState<RaffleProduct[]>([]);
  const [showProductForm, setShowProductForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<RaffleProduct | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [productTitle, setProductTitle] = useState('');
  const [productSubtitle, setProductSubtitle] = useState('');
  const [productImageData, setProductImageData] = useState<string | null>(null);
  const [productImageMimeType, setProductImageMimeType] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  const toRaffleMethod = useCallback((method?: number): 'default' | 'custom' => (
    method === 1 ? 'custom' : 'default'
  ), []);

  const toApiRaffleMethod = useCallback((method: 'default' | 'custom') => (
    method === 'custom' ? 1 : 0
  ), []);

  const fetchConfig = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.getRaffleConfig();
      setConfig(data);
      setMessageInput(data.disabledMessage || '');
      const nextRaffleMethod = toRaffleMethod(data.raffleMethod);
      setRaffleMethod(nextRaffleMethod);
      setError(null);
      
      if (nextRaffleMethod === 'custom') {
        await fetchProducts();
      }
    } catch {
      setError('Error al cargar la configuracion');
    } finally {
      setLoading(false);
    }
  }, [toRaffleMethod]);

  const fetchProducts = useCallback(async () => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/admin/raffle-products`, {
        credentials: 'include',
      });
      const data = await response.json();
      if (data.success) {
        setProducts(data.data || []);
      }
    } catch (err) {
      console.error('Error fetching products:', err);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const handleToggle = async () => {
    if (!config) return;
    try {
      setSaving(true);
      await api.updateRaffleConfig({
        isEnabled: !config.isEnabled,
        disabledMessage: !config.isEnabled ? (messageInput || null) : null,
        raffleMethod: toApiRaffleMethod(raffleMethod),
      });
      setConfig(prev => prev ? {
        ...prev,
        isEnabled: !prev.isEnabled,
        disabledMessage: !prev.isEnabled ? (messageInput || null) : null,
      } : null);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch {
      setError('Error al guardar los cambios');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveMessage = async () => {
    if (!config) return;
    try {
      setSaving(true);
      await api.updateRaffleConfig({
        isEnabled: config.isEnabled,
        disabledMessage: messageInput || null,
        raffleMethod: toApiRaffleMethod(raffleMethod),
      });
      setConfig(prev => prev ? { ...prev, disabledMessage: messageInput || null } : null);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch {
      setError('Error al guardar el mensaje');
    } finally {
      setSaving(false);
    }
  };

  const handleMethodChange = async (method: 'default' | 'custom') => {
    if (!config) return;
    try {
      setSaving(true);
      setRaffleMethod(method);
      await api.updateRaffleConfig({
        isEnabled: config.isEnabled,
        disabledMessage: config.disabledMessage,
        raffleMethod: toApiRaffleMethod(method),
      });
      
      if (method === 'custom') {
        await fetchProducts();
      }
      
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch {
      setError('Error al cambiar el metodo del sorteo');
    } finally {
      setSaving(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Solo se permiten archivos de imagen');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('La imagen no debe superar 5MB');
      return;
    }

    try {
      setUploadingImage(true);
      setError(null);
      
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1];
        setProductImageData(base64);
        setProductImageMimeType(file.type);
        setImagePreview(result);
      };
      reader.readAsDataURL(file);
    } catch {
      setError('Error al cargar la imagen');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSaveProduct = async () => {
    if (!productTitle.trim()) {
      setError('El titulo del producto es obligatorio');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const url = `${import.meta.env.VITE_API_URL || ''}/api/admin/raffle-products`;
      const method = editingProduct ? 'PUT' : 'POST';
      const endpoint = editingProduct ? `${url}/${editingProduct.id}` : url;

      const response = await fetch(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          title: productTitle,
          subtitle: productSubtitle || null,
          imageData: productImageData,
          imageMimeType: productImageMimeType,
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
        
        setProductTitle('');
        setProductSubtitle('');
        setProductImageData(null);
        setProductImageMimeType(null);
        setImagePreview(null);
        setShowProductForm(false);
        setEditingProduct(null);
        
        await fetchProducts();
      } else {
        setError(data.message || 'Error al guardar el producto');
      }
    } catch {
      setError('Error al guardar el producto');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteProduct = async (productId: number) => {
    if (!confirm('¿Estas seguro de que deseas eliminar este producto?')) return;

    try {
      setSaving(true);
      const response = await fetch(
        `${import.meta.env.VITE_API_URL || ''}/api/admin/raffle-products/${productId}`,
        {
          method: 'DELETE',
          credentials: 'include',
        }
      );

      const data = await response.json();
      if (data.success) {
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
        await fetchProducts();
      } else {
        setError(data.message || 'Error al eliminar el producto');
      }
    } catch {
      setError('Error al eliminar el producto');
    } finally {
      setSaving(false);
    }
  };

  const handleEditProduct = (product: RaffleProduct) => {
    setEditingProduct(product);
    setProductTitle(product.title);
    setProductSubtitle(product.subtitle || '');
    setShowProductForm(true);
  };

  const resetProductForm = () => {
    setProductTitle('');
    setProductSubtitle('');
    setProductImageData(null);
    setProductImageMimeType(null);
    setImagePreview(null);
    setShowProductForm(false);
    setEditingProduct(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <BackofficeLayout>
      <div className="p-3 xs:p-4 sm:p-6 xl:p-8" data-testid="raffle-config-content" data-ui="raffle-config-page">
        <div className="mb-6 xs:mb-8" data-ui="raffle-config-header">
          <h1 className="text-xl xs:text-2xl sm2:text-2xl lg:text-3xl font-bold text-white mb-1.5 xs:mb-2" data-ui="raffle-config-title">
            Configuracion del Sorteo
          </h1>
          <p className="text-sm xs:text-base text-gray-400" data-ui="raffle-config-subtitle">
            Activa o desactiva el sorteo y configura los productos del mismo
          </p>
        </div>

        <div className="bg-white/[0.03] backdrop-blur-sm border border-white/5 rounded-xl p-6 mb-6" data-ui="raffle-toggle-card">
          <div className="flex items-center justify-between mb-6" data-ui="raffle-toggle-row">
            <div data-ui="raffle-toggle-info">
              <h2 className="text-lg font-semibold text-white mb-1" data-ui="raffle-toggle-title">
                {config?.isEnabled ? 'Sorteo activo' : 'Sorteo desactivado'}
              </h2>
              <p className="text-sm text-gray-400" data-ui="raffle-toggle-desc">
                {config?.isEnabled
                  ? 'Los usuarios pueden participar en el sorteo'
                  : 'El formulario de sorteo no esta disponible'}
              </p>
            </div>
            <button
              onClick={handleToggle}
              disabled={saving}
              aria-label={config?.isEnabled ? 'Desactivar sorteo' : 'Activar sorteo'}
              className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors duration-200 ${
                config?.isEnabled ? 'bg-red-accent' : 'bg-gray-600'
              } ${saving ? 'opacity-50 cursor-not-allowed' : ''}`}
              data-testid="raffle-toggle-btn"
            >
              <span
                className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform duration-200 ${
                  config?.isEnabled ? 'translate-x-7' : 'translate-x-1'
                }`}
                data-ui="raffle-toggle-knob"
              />
            </button>
          </div>

          {!config?.isEnabled && (
            <div className="space-y-4" data-testid="message-input-section" data-ui="raffle-message-section">
              <div data-ui="raffle-message-field">
                <label
                  htmlFor="disabled-message"
                  className="block text-sm font-medium text-gray-300 mb-2"
                  data-ui="raffle-message-label"
                >
                  Mensaje para usuarios (opcional)
                </label>
                <input
                  id="disabled-message"
                  type="text"
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  placeholder="Escribe un mensaje personalizado..."
                  className="w-full px-4 py-3 text-base bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-accent/50 focus:border-red-accent transition-all"
                  data-testid="message-input"
                />
              </div>
              <button
                onClick={handleSaveMessage}
                disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2 min-h-[44px] text-sm font-medium text-white bg-red-accent hover:bg-red-accent/90 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                data-testid="save-message-btn"
              >
                {saving ? 'Guardando...' : 'Guardar mensaje'}
              </button>
            </div>
          )}
        </div>

        <div className="bg-white/[0.03] backdrop-blur-sm border border-white/5 rounded-xl p-6 mb-6" data-testid="raffle-method-selector" data-ui="raffle-method-card">
          <h2 className="text-lg font-semibold text-white mb-4" data-ui="raffle-method-title">Metodo del Sorteo</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" data-ui="raffle-method-options">
            <button
              onClick={() => handleMethodChange('default')}
              disabled={saving}
              className={`p-4 rounded-lg border-2 transition-all ${
                raffleMethod === 'default'
                  ? 'border-red-accent bg-red-accent/10'
                  : 'border-white/10 hover:border-white/20'
              } ${saving ? 'opacity-50 cursor-not-allowed' : ''}`}
              data-testid="method-default-option"
            >
              <h3 className="text-base font-semibold text-white mb-2" data-ui="method-default-title">Predeterminado</h3>
              <p className="text-sm text-gray-400" data-ui="method-default-desc">
                Usa el contenido predeterminado con animaciones de belt fijo
              </p>
            </button>
            <button
              onClick={() => handleMethodChange('custom')}
              disabled={saving}
              className={`p-4 rounded-lg border-2 transition-all ${
                raffleMethod === 'custom'
                  ? 'border-red-accent bg-red-accent/10'
                  : 'border-white/10 hover:border-white/20'
              } ${saving ? 'opacity-50 cursor-not-allowed' : ''}`}
              data-testid="method-custom-option"
            >
              <h3 className="text-base font-semibold text-white mb-2" data-ui="method-custom-title">Personalizado</h3>
              <p className="text-sm text-gray-400" data-ui="method-custom-desc">
                Permite agregar productos con imagenes, titulos y subtulos personalizados
              </p>
            </button>
          </div>
        </div>

        {raffleMethod === 'custom' && (
          <div className="bg-white/[0.03] backdrop-blur-sm border border-white/5 rounded-xl p-6 mb-6" data-testid="product-management-section" data-ui="product-management-card">
            <div className="flex items-center justify-between mb-6" data-ui="product-management-header">
              <h2 className="text-lg font-semibold text-white" data-ui="product-management-title">Productos del Sorteo</h2>
              <button
                onClick={() => {
                  resetProductForm();
                  setShowProductForm(true);
                }}
                disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2 min-h-[44px] text-sm font-medium text-white bg-red-accent hover:bg-red-accent/90 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                data-testid="add-product-btn"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" data-ui="add-product-icon">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Agregar Producto
              </button>
            </div>

            {showProductForm && (
              <div className="bg-white/5 border border-white/10 rounded-lg p-6 mb-6" data-testid="product-form" data-ui="product-form-card">
                <h3 className="text-base font-semibold text-white mb-4" data-ui="product-form-title">
                  {editingProduct ? 'Editar Producto' : 'Nuevo Producto'}
                </h3>
                
                <div className="space-y-4" data-ui="product-form-fields">
                  <div data-ui="product-title-field">
                    <label className="block text-sm font-medium text-gray-300 mb-2" data-ui="product-title-label">
                      Titulo del Producto *
                    </label>
                    <input
                      type="text"
                      value={productTitle}
                      onChange={(e) => setProductTitle(e.target.value)}
                      placeholder="Ej: Auriculares Premium"
                      className="w-full px-4 py-3 text-base bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-accent/50 focus:border-red-accent transition-all"
                      data-testid="product-title-input"
                    />
                  </div>

                  <div data-ui="product-subtitle-field">
                    <label className="block text-sm font-medium text-gray-300 mb-2" data-ui="product-subtitle-label">
                      Subtitulo (opcional)
                    </label>
                    <input
                      type="text"
                      value={productSubtitle}
                      onChange={(e) => setProductSubtitle(e.target.value)}
                      placeholder="Descripcion breve del producto"
                      className="w-full px-4 py-3 text-base bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-accent/50 focus:border-red-accent transition-all"
                      data-testid="product-subtitle-input"
                    />
                  </div>

                  <div data-ui="product-image-field">
                    <label className="block text-sm font-medium text-gray-300 mb-2" data-ui="product-image-label">
                      Imagen del Producto
                    </label>
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleImageUpload}
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      className="w-full px-4 py-3 text-base bg-white/5 border border-white/10 rounded-lg text-white file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-red-accent file:text-white hover:file:bg-red-accent/90"
                      data-testid="product-image-upload"
                    />
                    {uploadingImage && (
                      <p className="text-sm text-gray-400 mt-2" data-ui="product-image-uploading">Cargando imagen...</p>
                    )}
                  </div>

                  {imagePreview && (
                    <div data-testid="image-preview" data-ui="product-image-preview">
                      <p className="text-sm text-gray-300 mb-2" data-ui="product-preview-label">Vista previa:</p>
                      <img
                        src={imagePreview}
                        alt="Vista previa del producto"
                        className="max-w-xs h-auto rounded-lg border border-white/10"
                        data-ui="product-preview-img"
                      />
                    </div>
                  )}

                  <div className="flex gap-3 pt-4" data-ui="product-form-actions">
                    <button
                      onClick={handleSaveProduct}
                      disabled={saving || !productTitle.trim()}
                      className="flex-1 px-4 py-3 min-h-[44px] text-sm font-medium text-white bg-red-accent hover:bg-red-accent/90 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      data-testid="save-product-btn"
                    >
                      {saving ? 'Guardando...' : editingProduct ? 'Actualizar Producto' : 'Guardar Producto'}
                    </button>
                    <button
                      onClick={resetProductForm}
                      disabled={saving}
                      className="px-4 py-3 min-h-[44px] text-sm font-medium text-gray-300 bg-white/5 hover:bg-white/10 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      data-testid="cancel-product-btn"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              </div>
            )}

            {products.length > 0 && (
              <div className="space-y-3" data-testid="products-list" data-ui="products-list">
                {products.map((product) => (
                  <div
                    key={product.id}
                    className="bg-white/5 border border-white/10 rounded-lg p-4 flex flex-col sm:flex-row gap-4"
                    data-testid="product-item"
                    data-ui={`product-item-${product.id}`}
                  >
                    <div className="w-full sm:w-32 h-32 flex-shrink-0" data-ui={`product-image-container-${product.id}`}>
                      {product.hasImage ? (
                        <div className="w-full h-full bg-gradient-to-br from-red-accent/20 to-red-accent/5 rounded-lg flex items-center justify-center" data-testid="product-image" data-ui={`product-image-placeholder-${product.id}`}>
                          <svg className="w-12 h-12 text-red-accent/50" fill="none" stroke="currentColor" viewBox="0 0 24 24" data-ui={`product-image-icon-${product.id}`}>
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                      ) : (
                        <div className="w-full h-full bg-white/5 rounded-lg flex items-center justify-center text-gray-500" data-ui={`product-no-image-${product.id}`}>
                          Sin imagen
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0" data-ui={`product-info-${product.id}`}>
                      <h3 className="text-base font-semibold text-white mb-1" data-testid="product-title" data-ui={`product-item-title-${product.id}`}>
                        {product.title}
                      </h3>
                      {product.subtitle && (
                        <p className="text-sm text-gray-400 mb-3" data-testid="product-subtitle" data-ui={`product-item-subtitle-${product.id}`}>
                          {product.subtitle}
                        </p>
                      )}
                      
                      <div className="flex gap-2" data-ui={`product-item-actions-${product.id}`}>
                        <button
                          onClick={() => handleEditProduct(product)}
                          disabled={saving}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                          data-testid="edit-product-btn"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => handleDeleteProduct(product.id)}
                          disabled={saving}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                          data-testid="delete-product-btn"
                        >
                          Eliminar
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {products.length === 0 && !showProductForm && (
              <div className="text-center py-12" data-ui="products-empty">
                <p className="text-gray-400" data-ui="products-empty-text">No hay productos configurados aun. Haz clic en "Agregar Producto" para comenzar.</p>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="p-4 mb-4 bg-red-accent/10 border border-red-accent/20 rounded-lg text-red-accent text-sm" data-testid="error-message" data-ui="raffle-config-error">
            {error}
          </div>
        )}
        {success && (
          <div className="p-4 mb-4 bg-green-500/10 border border-green-500/20 rounded-lg text-green-400 text-sm" data-testid="success-message" data-ui="raffle-config-success">
            Cambios guardados correctamente
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-12" data-testid="loading-spinner" data-ui="raffle-config-loading">
            <div className="w-8 h-8 border-2 border-white/20 border-t-red-accent rounded-full animate-spin" data-ui="raffle-config-spinner" />
          </div>
        )}
      </div>
    </BackofficeLayout>
  );
}

export default RaffleConfigPage;
