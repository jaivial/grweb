// Individual icon component exports
// These are convenience exports that wrap the Icon component with specific icons

import { Icon } from './Icon';
import type { IconName } from './types';

// Helper to create typed icon components
function createIconComponent(name: IconName) {
  return function IconComponent(props: Omit<import('./types').IconProps, 'name'>) {
    return <Icon name={name} {...props} />;
  };
}

// Arrow icons
export const ArrowLeftIcon = createIconComponent('arrow-left');
export const ArrowRightIcon = createIconComponent('arrow-right');
export const ArrowUpIcon = createIconComponent('arrow-up');
export const ArrowDownIcon = createIconComponent('arrow-down');

// Action icons
export const CheckIcon = createIconComponent('check');
export const XIcon = createIconComponent('x');
export const PlusIcon = createIconComponent('plus');
export const MinusIcon = createIconComponent('minus');
export const CloseIcon = createIconComponent('close');

// User icons
export const UserIcon = createIconComponent('user');
export const UsersIcon = createIconComponent('users');

// Object icons
export const TicketIcon = createIconComponent('ticket');
export const TrophyIcon = createIconComponent('trophy');
export const StarIcon = createIconComponent('star');
export const HeartIcon = createIconComponent('heart');
export const FireIcon = createIconComponent('fire');

// Finance icons
export const DollarIcon = createIconComponent('dollar');
export const CurrencyIcon = createIconComponent('dollar');
export const CreditCardIcon = createIconComponent('credit-card');

// Communication icons
export const MailIcon = createIconComponent('mail');
export const PhoneIcon = createIconComponent('phone');
export const InstagramIcon = createIconComponent('instagram');
export const TwitterIcon = createIconComponent('twitter');
export const FacebookIcon = createIconComponent('facebook');
export const ShareIcon = createIconComponent('share');

// File icons
export const FileTextIcon = createIconComponent('file-text');
export const DownloadIcon = createIconComponent('download');
export const UploadIcon = createIconComponent('upload');
export const CopyIcon = createIconComponent('copy');
export const EditIcon = createIconComponent('edit');
export const TrashIcon = createIconComponent('trash');
export const DeleteIcon = createIconComponent('trash');

// UI icons
export const SearchIcon = createIconComponent('search');
export const MenuIcon = createIconComponent('menu');
export const SettingsIcon = createIconComponent('settings');
export const FilterIcon = createIconComponent('filter');
export const SortIcon = createIconComponent('sort');
export const GridIcon = createIconComponent('grid');
export const ListIcon = createIconComponent('list');
export const RefreshIcon = createIconComponent('refresh');

// Security icons
export const LockIcon = createIconComponent('lock');
export const UnlockIcon = createIconComponent('unlock');
export const ShieldIcon = createIconComponent('shield');
export const EyeIcon = createIconComponent('eye');
export const EyeOffIcon = createIconComponent('eye-off');
export const LogoutIcon = createIconComponent('logout');

// Status icons
export const WarningIcon = createIconComponent('warning');
export const InfoIcon = createIconComponent('info');
export const QuestionIcon = createIconComponent('question');
export const AlertIcon = createIconComponent('warning');

// Date/Time icons
export const CalendarIcon = createIconComponent('calendar');
export const ClockIcon = createIconComponent('clock');

// Misc icons
export const SparklesIcon = createIconComponent('sparkles');
export const LightningIcon = createIconComponent('lightning');
export const ZapIcon = createIconComponent('zap');
export const GlobeIcon = createIconComponent('globe');
export const MapPinIcon = createIconComponent('map-pin');
export const TargetIcon = createIconComponent('target');
export const AwardIcon = createIconComponent('award');
export const HomeIcon = createIconComponent('home');
export const DashboardIcon = createIconComponent('dashboard');

// Chart icons
export const TrendingUpIcon = createIconComponent('trending-up');
export const TrendingDownIcon = createIconComponent('trending-down');
export const ActivityIcon = createIconComponent('activity');
export const BarChartIcon = createIconComponent('bar-chart');
export const PieChartIcon = createIconComponent('pie-chart');

// Chevron icons
export const ChevronDownIcon = createIconComponent('chevron-down');
export const ChevronUpIcon = createIconComponent('chevron-up');
export const ChevronLeftIcon = createIconComponent('chevron-left');
export const ChevronRightIcon = createIconComponent('chevron-right');

// Link icons
export const ExternalLinkIcon = createIconComponent('external-link');

// Scale icon (for fairness)
export const ScaleIcon = createIconComponent('target');
