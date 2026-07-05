import { useCallback, useEffect, useMemo, useState } from 'react';
import { registerCoreBlocks } from '@wordpress/block-library';
import { parse, serialize } from '@wordpress/blocks';
import type { WPBlock } from '@wordpress/blocks';
import {
  BlockEditorProvider,
  BlockList,
  BlockTools,
  WritingFlow,
  ObserveTyping,
  BlockInspector,
  BlockBreadcrumb,
  Inserter,
} from '@wordpress/block-editor';
import { Popover, SlotFillProvider } from '@wordpress/components';
import { api } from '../../../api/client';

import '@wordpress/components/build-style/style.css';
import '@wordpress/block-editor/build-style/style.css';
import '@wordpress/block-editor/build-style/content.css';
import '@wordpress/block-library/build-style/style.css';
import '@wordpress/block-library/build-style/editor.css';
import '@wordpress/format-library/build-style/style.css';
import './gutenberg.css';

// Core blocks register once for the whole app.
let coreBlocksRegistered = false;
function ensureCoreBlocks(): void {
  if (coreBlocksRegistered) return;
  registerCoreBlocks();
  coreBlocksRegistered = true;
}

// Color palette offered in the text/background/link color pickers. Tuned to the
// FER dark email shell but recipients can pick any custom color too.
const EDITOR_COLORS = [
  { name: 'Blanco', slug: 'blanco', color: '#FFFFFF' },
  { name: 'Texto', slug: 'texto', color: '#E6EDF3' },
  { name: 'Tenue', slug: 'tenue', color: '#8B949E' },
  { name: 'Azul', slug: 'azul', color: '#58A6FF' },
  { name: 'Verde', slug: 'verde', color: '#3FB950' },
  { name: 'Ámbar', slug: 'ambar', color: '#D29922' },
  { name: 'Rojo', slug: 'rojo', color: '#F85149' },
  { name: 'Superficie', slug: 'superficie', color: '#161B22' },
  { name: 'Fondo', slug: 'fondo', color: '#0D1117' },
  { name: 'Negro', slug: 'negro', color: '#000000' },
];

const EDITOR_FONT_SIZES = [
  { name: 'Pequeño', slug: 'small', size: '13px' },
  { name: 'Normal', slug: 'normal', size: '16px' },
  { name: 'Mediano', slug: 'medium', size: '20px' },
  { name: 'Grande', slug: 'large', size: '28px' },
  { name: 'Enorme', slug: 'huge', size: '36px' },
];

const EDITOR_GRADIENTS = [
  { name: 'FER', slug: 'fer', gradient: 'linear-gradient(135deg,#1a1a2e 0%,#16213E 50%,#0F3460 100%)' },
  { name: 'Azul', slug: 'azul', gradient: 'linear-gradient(135deg,#58A6FF 0%,#0F3460 100%)' },
];

// theme.json-style `settings` tree. Block-support panels (color, typography,
// alignment, spacing, border) resolve their availability through
// `settings.__experimentalFeatures`, so enabling features here is what turns the
// styling controls on for text, headings and images.
const EDITOR_FEATURES = {
  color: {
    text: true,
    background: true,
    link: true,
    custom: true,
    customGradient: true,
    defaultPalette: false,
    defaultGradients: false,
    palette: { default: EDITOR_COLORS },
    gradients: { default: EDITOR_GRADIENTS },
  },
  typography: {
    fontSize: true,
    customFontSize: true,
    lineHeight: true,
    textAlign: true,
    fontStyle: true,
    fontWeight: true,
    letterSpacing: true,
    textDecoration: true,
    textTransform: true,
    fontSizes: { default: EDITOR_FONT_SIZES },
  },
  spacing: {
    margin: true,
    padding: true,
    blockGap: true,
    units: ['px', 'em', 'rem', '%'],
  },
  border: {
    color: true,
    radius: true,
    style: true,
    width: true,
  },
  layout: {
    contentSize: '640px',
    wideSize: '640px',
  },
};

// WP serializes palette/font-size presets as CSS classes (`has-azul-color`,
// `has-large-font-size`, …) whose real values live only in editor CSS. Sent
// emails and the preview iframe have no such stylesheet, so we inline the
// preset values onto each element's `style` at serialize time. The classes are
// left intact (harmless) and the inline style guarantees correct rendering in
// every email client.
const PRESET_STYLE_MAP: Record<string, string> = {
  ...Object.fromEntries(EDITOR_COLORS.map((c) => [`has-${c.slug}-color`, `color:${c.color}`])),
  ...Object.fromEntries(EDITOR_COLORS.map((c) => [`has-${c.slug}-background-color`, `background-color:${c.color}`])),
  ...Object.fromEntries(EDITOR_FONT_SIZES.map((f) => [`has-${f.slug}-font-size`, `font-size:${f.size}`])),
  ...Object.fromEntries(EDITOR_GRADIENTS.map((g) => [`has-${g.slug}-gradient-background`, `background:${g.gradient}`])),
  // Text alignment within a block serializes as `has-text-align-*` (class only).
  'has-text-align-left': 'text-align:left',
  'has-text-align-center': 'text-align:center',
  'has-text-align-right': 'text-align:right',
  // Image/block alignment serializes as `align*` (class only). WP editor CSS
  // turns these into margins/floats; emails lack that CSS, so inline the
  // email-safe block-centering equivalent (float is unreliable in email).
  'alignleft': 'margin-right:auto',
  'alignright': 'margin-left:auto',
  'aligncenter': 'margin-left:auto;margin-right:auto',
};

function inlinePresetStyles(html: string): string {
  if (!html.includes('has-') && !html.includes('align')) return html;
  return html.replace(/<([a-zA-Z][\w-]*)\b([^>]*?)\bclass="([^"]*)"([^>]*)>/g, (tag, name, pre, classes, post) => {
    const decls = classes
      .split(/\s+/)
      .map((cls: string) => PRESET_STYLE_MAP[cls])
      .filter(Boolean);
    if (decls.length === 0) return tag;
    const all = `${pre}class="${classes}"${post}`;
    const styleMatch = all.match(/\bstyle="([^"]*)"/);
    const existing = styleMatch ? styleMatch[1].replace(/;?\s*$/, ';') : '';
    const merged = `${existing}${decls.join(';')}`;
    const attrs = styleMatch
      ? all.replace(/\bstyle="[^"]*"/, `style="${merged}"`)
      : `${all} style="${merged}"`;
    return `<${name}${attrs}>`;
  });
}

export interface GutenbergEditorProps {
  /** Serialized Gutenberg block HTML (source of truth). */
  value: string;
  /** Fired with freshly serialized HTML whenever blocks change. */
  onChange: (html: string) => void;
  /** Disable editing (e.g. while a newsletter is sending/sent). */
  readOnly?: boolean;
}

export function GutenbergEditor({ value, onChange, readOnly = false }: GutenbergEditorProps) {
  ensureCoreBlocks();

  const [blocks, setBlocks] = useState<WPBlock[]>(() => parse(value || ''));

  // Re-parse when an external value replaces the document (e.g. loading a draft,
  // or the backend returning CDN-rewritten HTML after save). Compare against the
  // current serialization to avoid clobbering in-flight edits.
  useEffect(() => {
    // Compare against the same inlined form we emit, so a value that only
    // differs by our preset inlining isn't treated as an external change
    // (which would re-parse and disrupt the editing session).
    const current = inlinePresetStyles(serialize(blocks));
    if (value !== current) {
      setBlocks(parse(value || ''));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const [inspectorOpen, setInspectorOpen] = useState(false);

  // Upload dropped/selected images to BunnyCDN via the backend, then hand the
  // returned public CDN URL back to the block. Defining this enables the
  // "Upload"/"Media Library" buttons on image/figure blocks (without it WP only
  // offers "Insert from URL").
  const mediaUpload = useCallback(
    ({
      filesList,
      onFileChange,
      onError,
    }: {
      filesList: ArrayLike<File>;
      onFileChange: (media: Array<{ id: number; url: string; alt: string; caption: string; mime: string }>) => void;
      onError?: (message: string) => void;
    }) => {
      const files = Array.from(filesList);
      void (async () => {
        const uploaded: Array<{ id: number; url: string; alt: string; caption: string; mime: string }> = [];
        for (const file of files) {
          const res = await api.uploadImage(file);
          if (res.success && res.data?.imageUrl) {
            uploaded.push({
              id: Date.now() + uploaded.length,
              url: res.data.imageUrl,
              alt: '',
              caption: '',
              mime: 'image/webp',
            });
          } else {
            onError?.(res.message || 'Error al subir la imagen');
          }
        }
        if (uploaded.length > 0) onFileChange(uploaded);
      })();
    },
    [],
  );

  const settings = useMemo(
    () => ({
      // No hasFixedToolbar: lets <BlockTools> render the floating block toolbar
      // (with hasFixedToolbar it suppresses the popover and expects a fixed
      // toolbar mounted in a header, which this embedded editor has none).
      mediaUpload,
      // Image alignment incl. wide/full, and wide alignment for text/headings.
      alignWide: true,
      supportsLayout: true,
      imageEditing: true,
      // Drive the styling panels (color, typography, spacing, border).
      __experimentalFeatures: EDITOR_FEATURES,
      // Deprecated-flag fallbacks still read by some controls.
      colors: EDITOR_COLORS,
      fontSizes: EDITOR_FONT_SIZES,
      gradients: EDITOR_GRADIENTS,
      enableCustomLineHeight: true,
      enableCustomSpacing: true,
      enableCustomUnits: true,
      disableCustomColors: false,
      disableCustomFontSizes: false,
      disableCustomGradients: false,
    }),
    [mediaUpload],
  );

  const emit = useCallback(
    (next: WPBlock[]) => {
      setBlocks(next);
      onChange(inlinePresetStyles(serialize(next)));
    },
    [onChange],
  );

  return (
    <div className="newsletter-gutenberg" data-ui="newsletter-gutenberg">
      <SlotFillProvider>
        <BlockEditorProvider
          value={blocks}
          onInput={readOnly ? undefined : emit}
          onChange={readOnly ? undefined : emit}
          settings={settings}
        >
          {!readOnly && (
            <div className="newsletter-gutenberg__header" data-ui="newsletter-gutenberg-header">
              <Inserter
                position="bottom right"
                showInserterHelpPanel={false}
                toggleProps={{ variant: 'primary', 'data-ui': 'newsletter-gutenberg-inserter' }}
              />
              <button
                type="button"
                className="newsletter-gutenberg__inspector-toggle"
                data-ui="newsletter-gutenberg-inspector-toggle"
                aria-pressed={inspectorOpen}
                onClick={() => setInspectorOpen((open) => !open)}
              >
                {inspectorOpen ? 'Ocultar ajustes' : 'Ajustes del bloque'}
              </button>
            </div>
          )}
          {inspectorOpen && (
            <div
              className="newsletter-gutenberg__inspector is-open"
              data-ui="newsletter-gutenberg-inspector"
            >
              <div className="newsletter-gutenberg__inspector-head">
                <span>Ajustes</span>
                <button
                  type="button"
                  className="newsletter-gutenberg__inspector-close"
                  data-ui="newsletter-gutenberg-inspector-close"
                  aria-label="Cerrar ajustes"
                  onClick={() => setInspectorOpen(false)}
                >
                  ×
                </button>
              </div>
              <BlockInspector />
            </div>
          )}
          <div className="newsletter-gutenberg__canvas" data-ui="newsletter-gutenberg-canvas">
            <BlockTools>
              <WritingFlow>
                <ObserveTyping>
                  <BlockList />
                </ObserveTyping>
              </WritingFlow>
            </BlockTools>
            <div className="newsletter-gutenberg__breadcrumb" data-ui="newsletter-gutenberg-breadcrumb">
              <BlockBreadcrumb />
            </div>
          </div>
          <Popover.Slot />
        </BlockEditorProvider>
      </SlotFillProvider>
    </div>
  );
}

export default GutenbergEditor;
