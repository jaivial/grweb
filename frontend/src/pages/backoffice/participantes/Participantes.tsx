import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import { BackofficeLayout } from '../../../layouts/BackofficeLayout';
import { api } from '../../../utils/api';

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

export default function Participantes(): JSX.Element {
  const [data, setData] = useState<ParticipantsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    fetchParticipants();
  }, [currentPage, debouncedSearch]);

  async function fetchParticipants() {
    try {
      setLoading(true);
      const response = await api.getParticipants(currentPage, debouncedSearch || undefined);
      setData(response);
      setError(null);
    } catch {
      setError('Error al cargar participantes');
    } finally {
      setLoading(false);
    }
  }

  async function handleExport() {
    try {
      await api.exportCsv();
    } catch {
      alert('Error al exportar CSV');
    }
  }

  function formatDate(dateString: string) {
    return new Date(dateString).toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function getPageNumbers() {
    if (!data) return [];
    const pages = [];
    const maxVisible = 5;
    let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    let end = Math.min(data.totalPages, start + maxVisible - 1);
    if (end - start < maxVisible - 1) start = Math.max(1, end - maxVisible + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  }

  return (
    <BackofficeLayout>
      <div className="p-3 xs:p-4 sm:p-6 xl:p-8" data-ui="participantes-page">
        {/* Header */}
        <div className="mb-4 xs:mb-6 flex flex-col xs:flex-row xs:items-center xs:justify-between gap-3 xs:gap-4" data-ui="page-header">
          <div>
            <h1 className="text-xl xs:text-2xl sm2:text-2xl lg:text-3xl font-bold text-white mb-1">Participantes</h1>
            <p className="text-sm xs:text-base text-gray-400">Administra las entradas del sorteo</p>
          </div>
          <button
            onClick={handleExport}
            className="inline-flex items-center gap-2 px-3 xs:px-4 py-2 min-h-[44px] text-sm font-medium text-gray-300 bg-white/5 hover:bg-white/[0.08] backdrop-blur-sm border border-white/10 rounded-lg transition-all duration-150"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span className="hidden xs:inline">Exportar CSV</span>
            <span className="xs:hidden">CSV</span>
          </button>
        </div>

        {/* Search */}
        <div className="mb-4 xs:mb-6">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 xs:pl-4 flex items-center pointer-events-none">
              <svg className="w-4 h-4 xs:w-5 xs:h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              type="text"
              value={searchTerm}
              onInput={(e) => setSearchTerm((e.target as HTMLInputElement).value)}
              placeholder="Buscar por nombre, email o Instagram..."
              className="w-full bg-dark-surface border border-white/10 rounded-xl py-2.5 xs:py-3 pl-10 xs:pl-12 pr-4 text-sm xs:text-base text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-accent/50 transition-colors min-h-[44px]"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute inset-y-0 right-0 pr-3 xs:pr-4 flex items-center text-gray-500 hover:text-white transition-colors min-h-[44px]"
              >
                <svg className="w-4 h-4 xs:w-5 xs:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-6">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {/* Table */}
        {data && (
          <>
            <div className="bg-dark-surface/50 backdrop-blur-sm border border-white/5 rounded-xl overflow-hidden">
              {/* Desktop */}
              <div className="hidden xl:block overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/5">
                      <th className="px-4 xs:px-6 py-3 xs:py-4 text-left text-xs font-semibold text-gray-400 uppercase">Nombre</th>
                      <th className="px-4 xs:px-6 py-3 xs:py-4 text-left text-xs font-semibold text-gray-400 uppercase">Email</th>
                      <th className="px-4 xs:px-6 py-3 xs:py-4 text-left text-xs font-semibold text-gray-400 uppercase">Instagram</th>
                      <th className="px-4 xs:px-6 py-3 xs:py-4 text-center text-xs font-semibold text-gray-400 uppercase">Tickets</th>
                      <th className="px-4 xs:px-6 py-3 xs:py-4 text-right text-xs font-semibold text-gray-400 uppercase">Pagado</th>
                      <th className="px-4 xs:px-6 py-3 xs:py-4 text-right text-xs font-semibold text-gray-400 uppercase">Fecha</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {data.participants.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 xs:px-6 py-8 xs:py-12 text-center text-gray-500">
                          {searchTerm ? 'Sin resultados para la busqueda' : 'Sin participantes todavia'}
                        </td>
                      </tr>
                    ) : (
                      data.participants.map((p) => (
                        <tr key={p.id} className="hover:bg-white/[0.02] transition-colors">
                          <td className="px-4 xs:px-6 py-3 xs:py-4 text-white font-medium text-sm xs:text-base">{p.firstName} {p.surname}</td>
                          <td className="px-4 xs:px-6 py-3 xs:py-4 text-gray-400 text-xs xs:text-sm">{p.email}</td>
          <td className="px-4 xs:px-6 py-3 xs:py-4">
                              <span className="text-red-accent text-xs xs:text-sm">@{p.instagram.replace('@', '')}</span>
                          </td>
                          <td className="px-4 xs:px-6 py-3 xs:py-4 text-center">
                            <span className="px-2 xs:px-3 py-0.5 xs:py-1 inline-flex text-xs xs:text-sm font-bold rounded-full bg-white/5 text-gray-300">
                              {p.ticketCount}
                            </span>
                          </td>
                          <td className="px-4 xs:px-6 py-3 xs:py-4 text-right text-white font-medium text-sm xs:text-base">{(p.totalPaid).toFixed(2)} EUR</td>
                          <td className="px-4 xs:px-6 py-3 xs:py-4 text-right text-gray-500 text-xs xs:text-sm">{formatDate(p.createdAt)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Mobile */}
              <div className="xl:hidden divide-y divide-white/5">
                {data.participants.length === 0 ? (
                  <div className="px-6 py-12 text-center text-gray-500">
                    {searchTerm ? 'Sin resultados' : 'Sin participantes'}
                  </div>
                ) : (
                  data.participants.map((p) => (
                    <div key={p.id} className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <div className="text-white font-semibold">{p.firstName} {p.surname}</div>
                          <div className="text-red-accent text-sm">@{p.instagram.replace('@', '')}</div>
                        </div>
                        <span className="px-3 py-1 text-sm font-bold rounded-full bg-white/5 text-gray-300">{p.ticketCount}</span>
                      </div>
                      <div className="space-y-1 text-sm">
                        <div className="text-gray-400">{p.email}</div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Pagado:</span>
                          <span className="text-white font-medium">{(p.totalPaid).toFixed(2)} EUR</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Fecha:</span>
                          <span className="text-gray-400">{formatDate(p.createdAt)}</span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Pagination */}
            {data.totalPages > 1 && (
              <div className="mt-4 xs:mt-6 flex flex-col xs:flex-row items-center justify-between gap-3 xs:gap-4">
                <div className="text-gray-400 text-xs xs:text-sm order-2 xs:order-1">
                  Mostrando {((currentPage - 1) * data.pageSize) + 1} - {Math.min(currentPage * data.pageSize, data.totalCount)} de {data.totalCount}
                </div>
                <div className="flex items-center gap-1 xs:gap-2 order-1 xs:order-2">
                  <button
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    className="px-2.5 xs:px-4 py-2 min-h-[40px] xs:min-h-[44px] bg-white/5 border border-white/10 rounded-lg text-gray-300 hover:bg-white/[0.08] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <svg className="w-4 h-4 xs:w-5 xs:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  {getPageNumbers().map((page) => (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      className={`px-2.5 xs:px-4 py-2 min-h-[40px] xs:min-h-[44px] rounded-lg font-medium transition-all text-sm ${
                        page === currentPage
                          ? 'bg-red-accent text-white'
                          : 'bg-white/5 border border-white/10 text-gray-300 hover:bg-white/[0.08]'
                      }`}
                    >
                      {page}
                    </button>
                  ))}
                  <button
                    onClick={() => setCurrentPage(Math.min(data.totalPages, currentPage + 1))}
                    disabled={currentPage === data.totalPages}
                    className="px-2.5 xs:px-4 py-2 min-h-[40px] xs:min-h-[44px] bg-white/5 border border-white/10 rounded-lg text-gray-300 hover:bg-white/[0.08] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <svg className="w-4 h-4 xs:w-5 xs:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              </div>
            )}

            {/* Stats */}
            {data.participants.length > 0 && (
              <div className="mt-4 xs:mt-6 grid grid-cols-2 xs:grid-cols-2 sm2:grid-cols-4 gap-2 xs:gap-3">
                <div className="p-3 xs:p-4 bg-white/[0.02] backdrop-blur-sm border border-white/5 rounded-xl">
                  <p className="text-gray-500 text-xs xs:text-sm mb-1">Total</p>
                  <p className="text-lg xs:text-xl font-bold text-white">{data.totalCount}</p>
                </div>
                <div className="p-3 xs:p-4 bg-white/[0.02] backdrop-blur-sm border border-white/5 rounded-xl">
                  <p className="text-gray-500 text-xs xs:text-sm mb-1">Pagina</p>
                  <p className="text-lg xs:text-xl font-bold text-red-accent">{currentPage} / {data.totalPages}</p>
                </div>
                <div className="p-3 xs:p-4 bg-white/[0.02] backdrop-blur-sm border border-white/5 rounded-xl">
                  <p className="text-gray-500 text-xs xs:text-sm mb-1">Por pagina</p>
                  <p className="text-lg xs:text-xl font-bold text-white">{data.pageSize}</p>
                </div>
                <div className="p-3 xs:p-4 bg-white/[0.02] backdrop-blur-sm border border-white/5 rounded-xl">
                  <p className="text-gray-500 text-xs xs:text-sm mb-1">Busqueda</p>
                  <p className="text-lg xs:text-xl font-bold text-gray-400">{searchTerm ? 'Si' : 'No'}</p>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </BackofficeLayout>
  );
}
