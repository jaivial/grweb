import { useEffect, useState } from 'react';
import { api } from '../../utils/api';

interface Participant {
  id: number;
  firstName: string;
  surname: string;
  email: string;
  instagram: string;
  ticketCount: number;
  totalPaid: number;
  createdAt: string;
}

interface ParticipantsResponse {
  participants: Participant[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export default function Participants() {
  const [data, setData] = useState<ParticipantsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Debounce search term
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1); // Reset to first page on search
    }, 500);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Fetch participants when page or search changes
  useEffect(() => {
    fetchParticipants();
  }, [currentPage, debouncedSearch]);

  async function fetchParticipants() {
    try {
      setLoading(true);
      const response = await api.getParticipants(
        currentPage,
        debouncedSearch || undefined
      );
      setData(response);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load participants');
    } finally {
      setLoading(false);
    }
  }

  async function handleExport() {
    try {
      await api.exportCsv();
    } catch (err) {
      console.error('Export failed:', err);
      alert('Failed to export CSV');
    }
  }

  function formatDate(dateString: string) {
    return new Date(dateString).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  // Generate page numbers
  function getPageNumbers() {
    if (!data) return [];
    
    const pages = [];
    const maxVisible = 5;
    let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    let end = Math.min(data.totalPages, start + maxVisible - 1);
    
    if (end - start < maxVisible - 1) {
      start = Math.max(1, end - maxVisible + 1);
    }
    
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    
    return pages;
  }

  return (
    <div className="min-h-screen bg-dark-base p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8 animate-fade-in">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-text-primary mb-2">Participants</h1>
              <p className="text-text-secondary">Manage raffle entries</p>
            </div>
            <button
              onClick={handleExport}
              className="px-6 py-3 bg-green-500 text-dark-base font-bold rounded-lg hover:scale-105 transition-transform flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
              </svg>
              Export CSV
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="mb-6 animate-slide-up">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <svg className="w-5 h-5 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
              </svg>
            </div>
            <input
              type="text"
              value={searchTerm}
              onInput={(e) => setSearchTerm((e.target as HTMLInputElement).value)}
              placeholder="Search by name, email, or Instagram..."
              className="w-full bg-dark-surface border-2 border-dark-lighter rounded-xl py-3 pl-12 pr-4 text-text-primary placeholder-text-muted focus:border-red-accent focus:outline-none transition-colors"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute inset-y-0 right-0 pr-4 flex items-center text-text-muted hover:text-text-primary transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/50 rounded-xl p-4 mb-6">
            <p className="text-red-500">{error}</p>
            <button
              onClick={fetchParticipants}
              className="mt-2 text-red-400 hover:text-red-300 underline"
            >
              Try again
            </button>
          </div>
        )}

        {/* Loading State */}
        {loading && !data && (
          <div className="animate-pulse">
            <div className="bg-dark-surface rounded-xl h-96"></div>
          </div>
        )}

        {/* Table */}
        {data && (
          <>
            <div className="bg-dark-surface rounded-xl border border-dark-lighter overflow-hidden animate-fade-in">
              {/* Desktop Table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-dark-base">
                    <tr>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">
                        Name
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">
                        Email
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">
                        Instagram
                      </th>
                      <th className="px-6 py-4 text-center text-xs font-semibold text-text-secondary uppercase tracking-wider">
                        Tickets
                      </th>
                      <th className="px-6 py-4 text-right text-xs font-semibold text-text-secondary uppercase tracking-wider">
                        Total Paid
                      </th>
                      <th className="px-6 py-4 text-right text-xs font-semibold text-text-secondary uppercase tracking-wider">
                        Date
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-dark-lighter">
                    {data.participants.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-12 text-center text-text-muted">
                          {searchTerm ? 'No participants found matching your search' : 'No participants yet'}
                        </td>
                      </tr>
                    ) : (
                      data.participants.map((participant, index) => (
                        <tr 
                          key={participant.id} 
                          className="hover:bg-dark-base/50 transition-colors animate-slide-up"
                          style={`animation-delay: ${index * 0.05}s`}
                        >
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-text-primary font-semibold">
                              {participant.firstName} {participant.surname}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-text-secondary text-sm">{participant.email}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-red-accent text-sm">@{participant.instagram.replace('@', '')}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            <span className="px-3 py-1 inline-flex text-sm font-bold leading-5 rounded-full bg-dark-red/10 text-dark-red">
                              {participant.ticketCount}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right">
                            <div className="text-text-primary font-semibold">€{participant.totalPaid.toFixed(2)}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-text-muted text-sm">
                            {formatDate(participant.createdAt)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Mobile Cards */}
              <div className="md:hidden divide-y divide-dark-lighter">
                {data.participants.length === 0 ? (
                  <div className="px-6 py-12 text-center text-text-muted">
                    {searchTerm ? 'No participants found' : 'No participants yet'}
                  </div>
                ) : (
                  data.participants.map((participant, index) => (
                    <div 
                      key={participant.id} 
                      className="p-4 animate-slide-up"
                      style={`animation-delay: ${index * 0.05}s`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <div className="text-text-primary font-semibold">
                            {participant.firstName} {participant.surname}
                          </div>
                          <div className="text-red-accent text-sm">@{participant.instagram.replace('@', '')}</div>
                        </div>
                        <span className="px-3 py-1 inline-flex text-sm font-bold leading-5 rounded-full bg-dark-red/10 text-dark-red">
                          {participant.ticketCount} tickets
                        </span>
                      </div>
                      <div className="space-y-1 text-sm">
                        <div className="text-text-secondary">{participant.email}</div>
                        <div className="flex justify-between">
                          <span className="text-text-muted">Paid:</span>
                          <span className="text-text-primary font-semibold">€{participant.totalPaid.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-text-muted">Date:</span>
                          <span className="text-text-secondary">{formatDate(participant.createdAt)}</span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Pagination */}
            {data.totalPages > 1 && (
              <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4 animate-fade-in">
                <div className="text-text-secondary text-sm">
                  Showing {((currentPage - 1) * data.pageSize) + 1} to{' '}
                  {Math.min(currentPage * data.pageSize, data.totalCount)} of {data.totalCount} participants
                </div>
                
                <div className="flex items-center gap-2">
                  {/* Previous Button */}
                  <button
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    className="px-4 py-2 bg-dark-surface border border-dark-lighter rounded-lg text-text-primary hover:border-red-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
                    </svg>
                  </button>

                  {/* Page Numbers */}
                  {getPageNumbers().map((page) => (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      className={`px-4 py-2 rounded-lg font-semibold transition-all ${
                        page === currentPage
                          ? 'bg-red-accent text-dark-base'
                          : 'bg-dark-surface border border-dark-lighter text-text-primary hover:border-red-accent'
                      }`}
                    >
                      {page}
                    </button>
                  ))}
                  {/* Next Button */}
                  <button
                    onClick={() => setCurrentPage(Math.min(data.totalPages, currentPage + 1))}
                    disabled={currentPage === data.totalPages}
                    className="px-4 py-2 bg-dark-surface border border-dark-lighter rounded-lg text-text-primary hover:border-red-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
                    </svg>
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* Stats Summary */}
        {data && data.participants.length > 0 && (
          <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-4 animate-fade-in">
            <div className="bg-dark-surface rounded-xl p-4 border border-dark-lighter">
              <p className="text-text-muted text-sm mb-1">Total Participants</p>
              <p className="text-2xl font-bold text-text-primary">{data.totalCount}</p>
            </div>
            <div className="bg-dark-surface rounded-xl p-4 border border-dark-lighter">
              <p className="text-text-muted text-sm mb-1">Current Page</p>
              <p className="text-2xl font-bold text-red-accent">{currentPage} / {data.totalPages}</p>
            </div>
            <div className="bg-dark-surface rounded-xl p-4 border border-dark-lighter">
              <p className="text-text-muted text-sm mb-1">Page Size</p>
              <p className="text-2xl font-bold text-text-primary">{data.pageSize}</p>
            </div>
            <div className="bg-dark-surface rounded-xl p-4 border border-dark-lighter">
              <p className="text-text-muted text-sm mb-1">Search Active</p>
              <p className="text-2xl font-bold text-dark-red">{searchTerm ? 'Yes' : 'No'}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
