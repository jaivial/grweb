import { useEffect, useMemo, useState } from 'react';
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
} from '@wordpress/block-editor';

import '@wordpress/components/build-style/style.css';
import '@wordpress/block-editor/build-style/style.css';
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
    const current = serialize(blocks);
    if (value !== current) {
      setBlocks(parse(value || ''));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const settings = useMemo(
    () => ({
      hasFixedToolbar: true,
      // Inline media: keep images as data-URIs; the backend migrates them to CDN on save.
      mediaUpload: undefined,
    }),
    [],
  );

  const handleInput = (next: WPBlock[]) => {
    setBlocks(next);
    onChange(serialize(next));
  };

  const handleChange = (next: WPBlock[]) => {
    setBlocks(next);
    onChange(serialize(next));
  };

  return (
    <div className="newsletter-gutenberg" data-ui="newsletter-gutenberg">
      <BlockEditorProvider
        value={blocks}
        onInput={readOnly ? undefined : handleInput}
        onChange={readOnly ? undefined : handleChange}
        settings={settings}
      >
        <div className="newsletter-gutenberg__inspector" data-ui="newsletter-gutenberg-inspector">
          <BlockInspector />
        </div>
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
      </BlockEditorProvider>
    </div>
  );
}

export default GutenbergEditor;
