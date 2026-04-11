import { expect, within } from 'storybook/test';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Tabs } from './Tabs';

const meta = {
  component: Tabs,
  title: 'UI/Tabs',
  tags: ['autodocs'],
} satisfies Meta<typeof Tabs>;

export default meta;
type Story = StoryObj<typeof meta>;

const tabs = [
  { id: 'sorteo', label: 'Sorteo' },
  { id: 'manual', label: 'Manual' },
  { id: 'participantes', label: 'Participantes' },
  { id: 'premios', label: 'Premios' },
];

export const Default: Story = {
  args: {
    tabs,
    activeTab: 'sorteo',
    onChange: () => {},
  },
  play: async ({ canvas }) => {
    const sorteoTab = canvas.getByText('Sorteo');
    await expect(sorteoTab).toBeVisible();
    const premiosTab = canvas.getByText('Premios');
    await expect(premiosTab).toBeVisible();
  },
};

export const PremiosActive: Story = {
  args: {
    tabs,
    activeTab: 'premios',
    onChange: () => {},
  },
  play: async ({ canvas }) => {
    const premiosTab = canvas.getByText('Premios');
    await expect(premiosTab).toBeVisible();
  },
};
