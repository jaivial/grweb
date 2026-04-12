import { expect, fn, userEvent, within } from 'storybook/test';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { DeleteConfirmModal } from './DeleteConfirmModal';

const meta = {
  component: DeleteConfirmModal,
  title: 'Backoffice/Sorteo/DeleteConfirmModal',
  tags: ['autodocs'],
} satisfies Meta<typeof DeleteConfirmModal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = {
  args: {
    isOpen: true,
    giftTitle: 'Camiseta Oficial GR Cup',
    onClose: fn(),
    onConfirm: fn(),
  },
  play: async ({ args, canvas }) => {
    await expect(canvas.getByTestId('delete-confirm-modal')).toBeVisible();
    await expect(canvas.getByTestId('delete-confirm-no')).toBeVisible();
    await expect(canvas.getByTestId('delete-confirm-yes')).toBeVisible();
    await expect(canvas.getByTestId('delete-confirm-name')).toHaveTextContent('Camiseta Oficial GR Cup');
  },
};

export const CancelDelete: Story = {
  args: {
    isOpen: true,
    giftTitle: 'Camiseta Oficial GR Cup',
    onClose: fn(),
    onConfirm: fn(),
  },
  play: async ({ args, canvas }) => {
    await userEvent.click(canvas.getByTestId('delete-confirm-no'));
    await expect(args.onClose).toHaveBeenCalledTimes(1);
    await expect(args.onConfirm).not.toHaveBeenCalled();
  },
};

export const ConfirmDelete: Story = {
  args: {
    isOpen: true,
    giftTitle: 'Trofeo Campeón',
    onClose: fn(),
    onConfirm: fn(),
  },
  play: async ({ args, canvas }) => {
    await userEvent.click(canvas.getByTestId('delete-confirm-yes'));
    await expect(args.onConfirm).toHaveBeenCalledTimes(1);
  },
};
