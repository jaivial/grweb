import { expect, fn, userEvent, within } from 'storybook/test';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from './Button';

const meta = {
  component: Button,
  title: 'UI/Button',
  tags: ['autodocs'],
  argTypes: {
    variant: { control: 'select', options: ['primary', 'outline', 'ghost', 'danger'] },
    size: { control: 'select', options: ['sm', 'md', 'lg'] },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  args: {
    children: 'Guardar',
    variant: 'primary',
    onClick: fn(),
  },
  play: async ({ args, canvas }) => {
    const btn = canvas.getByRole('button', { name: 'Guardar' });
    await expect(btn).toBeVisible();
    await userEvent.click(btn);
    await expect(args.onClick).toHaveBeenCalledTimes(1);
  },
};

export const Outline: Story = {
  args: {
    children: 'Cancelar',
    variant: 'outline',
    onClick: fn(),
  },
  play: async ({ canvas }) => {
    const btn = canvas.getByRole('button', { name: 'Cancelar' });
    await expect(btn).toBeVisible();
  },
};

export const Danger: Story = {
  args: {
    children: 'Eliminar',
    variant: 'danger',
    onClick: fn(),
  },
  play: async ({ canvas }) => {
    const btn = canvas.getByRole('button', { name: 'Eliminar' });
    await expect(btn).toBeVisible();
  },
};

export const Disabled: Story = {
  args: {
    children: 'Deshabilitado',
    variant: 'primary',
    disabled: true,
    onClick: fn(),
  },
  play: async ({ args, canvas }) => {
    const btn = canvas.getByRole('button', { name: 'Deshabilitado' });
    await expect(btn).toBeDisabled();
    await userEvent.click(btn);
    await expect(args.onClick).not.toHaveBeenCalled();
  },
};
