import { expect, fn, within, waitFor } from 'storybook/test';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { FallbackImage } from './FallbackImage';

const meta = {
  component: FallbackImage,
  title: 'UI/FallbackImage',
  tags: ['autodocs'],
} satisfies Meta<typeof FallbackImage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithValidImage: Story = {
  args: {
    src: 'https://placehold.co/400x300/1a1a2e/ffffff?text=Gift',
    alt: 'Test prize image',
    className: 'w-full h-48 object-cover rounded-xl',
    onError: fn(),
  },
  play: async ({ canvas }) => {
    const img = canvas.getByRole('img');
    // Wait for the image to load (it starts with opacity-0 and becomes visible after onLoad)
    await waitFor(() => expect(img).toBeVisible());
  },
};

export const NullSrc: Story = {
  args: {
    src: null,
    alt: 'No image',
    className: 'w-full h-48 object-cover rounded-xl',
    onError: fn(),
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByTestId('fallback-image-icon')).toBeVisible();
  },
};

export const UndefinedSrc: Story = {
  args: {
    src: undefined,
    alt: 'No image',
    className: 'w-full h-48 object-cover rounded-xl',
    onError: fn(),
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByTestId('fallback-image-icon')).toBeVisible();
  },
};

export const EmptySrc: Story = {
  args: {
    src: '',
    alt: 'Empty source',
    className: 'w-full h-48 object-cover rounded-xl',
    onError: fn(),
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByTestId('fallback-image-icon')).toBeVisible();
  },
};
