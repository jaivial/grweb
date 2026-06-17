/**
 * Ambient declarations for the @wordpress/* packages used by the newsletter
 * editor. These releases ship no bundled .d.ts, so we declare the narrow
 * surface we consume. Blocks are treated opaquely on purpose.
 */

declare module '@wordpress/blocks' {
  /** Opaque parsed block node. */
  export interface WPBlock {
    clientId: string;
    name: string;
    attributes: Record<string, unknown>;
    innerBlocks: WPBlock[];
  }
  export function parse(content: string): WPBlock[];
  export function serialize(blocks: WPBlock[] | WPBlock): string;
  export function createBlock(name: string, attributes?: Record<string, unknown>): WPBlock;
  export function registerBlockType(name: string, settings: unknown): unknown;
  export function getBlockTypes(): unknown[];
}

declare module '@wordpress/block-library' {
  export function registerCoreBlocks(): void;
}

declare module '@wordpress/block-editor' {
  import type { ComponentType, ReactNode } from 'react';
  import type { WPBlock } from '@wordpress/blocks';

  export interface BlockEditorProviderProps {
    value: WPBlock[];
    onInput?: (blocks: WPBlock[]) => void;
    onChange?: (blocks: WPBlock[]) => void;
    settings?: Record<string, unknown>;
    children?: ReactNode;
  }
  export const BlockEditorProvider: ComponentType<BlockEditorProviderProps>;
  export const BlockList: ComponentType<Record<string, unknown>>;
  export const BlockTools: ComponentType<{ children?: ReactNode }>;
  export const WritingFlow: ComponentType<{ children?: ReactNode }>;
  export const ObserveTyping: ComponentType<{ children?: ReactNode }>;
  export const BlockInspector: ComponentType<Record<string, unknown>>;
  export const BlockBreadcrumb: ComponentType<Record<string, unknown>>;
}

declare module '@wordpress/format-library' {
  export {};
}
