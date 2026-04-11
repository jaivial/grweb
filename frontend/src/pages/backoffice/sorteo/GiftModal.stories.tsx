import { expect, fn, spyOn, userEvent, within } from 'storybook/test';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { GiftModal } from './GiftModal';

const meta = {
  component: GiftModal,
  title: 'Backoffice/Sorteo/GiftModal',
  tags: ['autodocs'],
  argTypes: {
    mode: { control: 'select', options: ['create', 'edit'] },
  },
} satisfies Meta<typeof GiftModal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const CreateMode: Story = {
  args: {
    mode: 'create',
    isOpen: true,
    onClose: fn(),
    onSave: fn(),
  },
  play: async ({ args, canvas }) => {
    const modal = within(canvas.parentElement || canvas);
    await expect(modal.getByTestId('gift-form-modal')).toBeVisible();
    await expect(modal.getByTestId('gift-modal-title')).toContainText('Nuevo');
    await expect(modal.getByTestId('gift-title-input')).toBeVisible();
    await expect(modal.getByTestId('gift-subtitle-input')).toBeVisible();
    await expect(modal.getByTestId('gift-save-btn')).toBeVisible();
  },
};

export const EditMode: Story = {
  args: {
    mode: 'edit',
    gift: { id: 1, title: 'Camiseta Oficial', subtitle: 'Edición limitada 2026' },
    isOpen: true,
    onClose: fn(),
    onSave: fn(),
  },
  play: async ({ args, canvas }) => {
    const modal = within(canvas.parentElement || canvas);
    await expect(modal.getByTestId('gift-form-modal')).toBeVisible();
    await expect(modal.getByTestId('gift-modal-title')).toContainText('Editar');
    await expect(modal.getByTestId('gift-title-input')).toHaveValue('Camiseta Oficial');
    await expect(modal.getByTestId('gift-subtitle-input')).toHaveValue('Edición limitada 2026');
  },
};

export const EditModeWithImage: Story = {
  args: {
    mode: 'edit',
    gift: {
      id: 2,
      title: 'Trofeo Campeón',
      subtitle: 'Primer premio',
      imageUrl: 'https://placehold.co/400x300/1a1a2e/ffffff?text=Trophy',
    },
    isOpen: true,
    onClose: fn(),
    onSave: fn(),
  },
  play: async ({ canvas }) => {
    const modal = within(canvas.parentElement || canvas);
    await expect(modal.getByTestId('gift-form-modal')).toBeVisible();
    await expect(modal.getByTestId('gift-image-preview-container')).toBeVisible();
  },
};

export const ValidateRequiredFields: Story = {
  args: {
    mode: 'create',
    isOpen: true,
    onClose: fn(),
    onSave: fn(),
  },
  play: async ({ args, canvas }) => {
    const modal = within(canvas.parentElement || canvas);
    const saveBtn = modal.getByTestId('gift-save-btn');
    await userEvent.click(saveBtn);
    await expect(modal.getByTestId('gift-title-error')).toBeVisible();
    await expect(args.onSave).not.toHaveBeenCalled();
  },
};

export const FillAndSubmit: Story = {
  args: {
    mode: 'create',
    isOpen: true,
    onClose: fn(),
    onSave: fn(),
  },
  play: async ({ args, canvas }) => {
    const modal = within(canvas.parentElement || canvas);
    await userEvent.type(modal.getByTestId('gift-title-input'), 'Nuevo Premio Test');
    await userEvent.type(modal.getByTestId('gift-subtitle-input'), 'Subtítulo del premio');
    await userEvent.click(modal.getByTestId('gift-save-btn'));
    await expect(args.onSave).toHaveBeenCalledTimes(1);
  },
};

export const CloseButtonWorks: Story = {
  args: {
    mode: 'create',
    isOpen: true,
    onClose: fn(),
    onSave: fn(),
  },
  play: async ({ args, canvas }) => {
    const modal = within(canvas.parentElement || canvas);
    await userEvent.click(modal.getByTestId('gift-modal-close'));
    await expect(args.onClose).toHaveBeenCalledTimes(1);
  },
};
