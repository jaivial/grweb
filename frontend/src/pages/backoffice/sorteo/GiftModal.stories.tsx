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
    await expect(canvas.getByTestId('gift-form-modal')).toBeVisible();
    await expect(canvas.getByTestId('gift-modal-title')).toHaveTextContent('Nuevo');
    await expect(canvas.getByTestId('gift-title-input')).toBeVisible();
    await expect(canvas.getByTestId('gift-subtitle-input')).toBeVisible();
    await expect(canvas.getByTestId('gift-save-btn')).toBeVisible();
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
    await expect(canvas.getByTestId('gift-form-modal')).toBeVisible();
    await expect(canvas.getByTestId('gift-modal-title')).toHaveTextContent('Editar');
    await expect(canvas.getByTestId('gift-title-input')).toHaveValue('Camiseta Oficial');
    await expect(canvas.getByTestId('gift-subtitle-input')).toHaveValue('Edición limitada 2026');
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
    await expect(canvas.getByTestId('gift-form-modal')).toBeVisible();
    await expect(canvas.getByTestId('gift-image-preview')).toBeVisible();
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
    const saveBtn = canvas.getByTestId('gift-save-btn');
    await userEvent.click(saveBtn);
    await expect(canvas.getByTestId('gift-title-error')).toBeVisible();
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
    await userEvent.click(canvas.getByTestId('gift-title-input'));
    await userEvent.type(canvas.getByTestId('gift-title-input'), 'Nuevo Premio Test');
    await userEvent.click(canvas.getByTestId('gift-subtitle-input'));
    await userEvent.type(canvas.getByTestId('gift-subtitle-input'), 'Subtítulo del premio');
    await userEvent.click(canvas.getByTestId('gift-save-btn'));
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
    await userEvent.click(canvas.getByTestId('gift-modal-close'));
    await expect(args.onClose).toHaveBeenCalledTimes(1);
  },
};
