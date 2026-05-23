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
    <div className={`bg-white/5 backdrop-blur-xl rounded-xl p-1 mx-auto w-fit ${className}`} data-ui="tabs">
      <div
        className="flex overflow-x-auto scrollbar-hide"
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
              flex items-center gap-2 px-4 py-2.5 min-h-[40px] text-sm font-medium whitespace-nowrap rounded-lg
              transition-all duration-300
              ${tab.disabled
                ? 'opacity-40 cursor-not-allowed text-white/40'
                : tab.id === activeTab
                  ? 'bg-red-accent text-white shadow-lg'
                  : 'text-white/60 hover:text-white hover:bg-white/10'
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