import { useCallback, type ReactNode } from 'react';
import type { JSX } from 'react';

export interface Tab {
  id: string;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
}

export interface TabsProps {
  tabs: Tab[];
  activeTab: string;
  onChange: (tabId: string) => void;
  className?: string;
}

export function Tabs({
  tabs,
  activeTab,
  onChange,
  className = '',
}: TabsProps): JSX.Element {
  const handleTabClick = useCallback((tabId: string) => {
    const tab = tabs.find(t => t.id === tabId);
    if (tab && !tab.disabled) {
      onChange(tabId);
    }
  }, [tabs, onChange]);

  return (
    <div className={`border-b border-dark-border ${className}`} data-ui="tabs">
      <div
        className="flex overflow-x-auto scrollbar-hide -mb-px"
        role="tablist"
        data-ui="tabs-list"
      >
        {tabs.map(tab => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            onClick={() => handleTabClick(tab.id)}
            disabled={tab.disabled}
            className={`
              flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap
              border-b-2 transition-colors
              ${tab.disabled
                ? 'opacity-50 cursor-not-allowed text-gray-500 border-transparent'
                : tab.id === activeTab
                  ? 'text-red-accent border-red-accent'
                  : 'text-gray-400 border-transparent hover:text-white hover:border-gray-600'
              }
            `}
            data-ui="tab"
            data-tab-id={tab.id}
            aria-selected={tab.id === activeTab}
            tabIndex={tab.disabled ? -1 : 0}
          >
            {tab.icon && <span data-ui="tab-icon">{tab.icon}</span>}
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default Tabs;
