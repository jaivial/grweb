/**
 * Participants Page
 * 
 * Admin page for viewing and managing participants.
 */

import type { JSX } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@components/ui';
import { ParticipantsTable, SearchBar, Pagination } from './components';
import { useParticipants } from './hooks';
import { ArrowLeftIcon, DownloadIcon } from '@components/ui/Icon';

export function Participants(): JSX.Element {
  const {
    participants,
    totalCount,
    currentPage,
    pageSize,
    totalPages,
    searchQuery,
    isLoading,
    isExporting,
    error,
    setSearchQuery,
    goToPage,
    nextPage,
    prevPage,
    exportCsv,
    refresh,
  } = useParticipants();
  const [location, navigate] = useLocation();

  return (
    <div className="min-h-screen bg-dark-base">
      {/* Header */}
      <header className="bg-dark-surface border-b border-dark-border">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/admin/dashboard')}
              >
                <ArrowLeftIcon className="w-5 h-5" />
              </Button>
              <div>
                <h1 className="text-2xl font-bold text-white">Participants</h1>
                <p className="text-gray-500 text-sm mt-1">
                  {totalCount} total participants
                </p>
              </div>
            </div>
            <Button
              variant="secondary"
              size="md"
              onClick={exportCsv}
              disabled={isExporting}
            >
              <DownloadIcon className="w-5 h-5" />
              {isExporting ? 'Exporting...' : 'Export CSV'}
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="bg-dark-surface rounded-xl border border-dark-border overflow-hidden">
          {/* Search Bar */}
          <div className="p-4 border-b border-dark-border">
            <SearchBar
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Search by name, email, or Instagram..."
              isLoading={isLoading}
            />
          </div>

          {/* Error State */}
          {error && (
            <div className="p-4 border-b border-dark-border">
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 flex items-center justify-between">
                <p className="text-red-500">{error}</p>
                <Button variant="secondary" size="sm" onClick={refresh}>
                  Retry
                </Button>
              </div>
            </div>
          )}

          {/* Table */}
          <ParticipantsTable participants={participants} isLoading={isLoading} />

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="p-4 border-t border-dark-border">
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={totalCount}
                pageSize={pageSize}
                onPageChange={goToPage}
                onPrevPage={prevPage}
                onNextPage={nextPage}
                isLoading={isLoading}
              />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default Participants;
