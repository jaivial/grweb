import { useMemo, useCallback, useRef, useEffect, useState } from 'react';
import { Head } from '../../components/Head';
import type { TutorialVideo } from '../../constants/videoUrls';
import { Heart, MessageCircle, Share2, ChevronUp, Send } from 'lucide-react';

// Use relative paths by default so nginx/Vite proxy route API requests.
const API_BASE = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL.replace(/\/+$/, '')
  : '';

// TikTok-style tutorial videos with hashtags
const TUTORIAL_VIDEOS: TutorialVideo[] = [
  {
    id: 'video-0508',
    title: '¿Qué es una competición de powerlifting?',
    description:
      'Una competición de powerlifting es sencilla: 3 intentos por movimiento, se registra la mejor marca válida de los 3 intentos. Primero haces sentadilla, luego va el press de banca y luego el peso muerto. Una competición perfecta sería hacer 3 intentos válidos en cada uno de los 3 ejercicios.',
    url: 'https://jaimedigitalstudio.b-cdn.net/fer/videos/0508(1).mp4',
    hashtags: '#powerlifting #fercup #sentadilla #pressdebanca #pesomuerto',
  },
  {
    id: 'video-0509',
    title: 'Requisitos',
    description:
      'Requisitos para la FER CUP II: pocos. No es necesario equipación reglamentaria ni equipamiento aprobado por la IPF, el objetivo es vivir la experiencia.',
    url: 'https://jaimedigitalstudio.b-cdn.net/fer/videos/0509.mp4',
    hashtags: '#requisitos #fercup #powerlifting #principiantes',
  },
  {
    id: 'video-0512',
    title: '¡Inscríbete!',
    description:
      'Esta competición está pensada para que puedas iniciarte en el powerlifting en un ambiente amigable, donde los fallos están permitidos para aprender acompañado de los profesionales del equipo GRStrength.',
    url: 'https://jaimedigitalstudio.b-cdn.net/fer/videos/0512.mp4',
    hashtags: '#inscripcion #fercup #powerlifting #grstrength',
  },
  {
    id: 'video-0513',
    title: 'Las reglas básicas',
    description:
      '¿Qué es válido? ¡Muy fácil! Para sentadilla debes romper la línea paralela de tus rodillas. En press de banca: parar la barra en el pecho. En peso muerto: levantar la barra hasta arriba del todo y bajar sin soltar la barra. Igualmente, si es tu primera competición no te vamos a exigir la perfección, estamos aquí para aprender.',
    url: 'https://jaimedigitalstudio.b-cdn.net/fer/videos/0513.mp4',
    hashtags: '#powerlifting #fercup #reglas #sentadilla #pressdebanca #pesomuerto',
  },
];

const TOTAL_VIDEOS = TUTORIAL_VIDEOS.length;

// Duplicate videos for seamless infinite loop
const LOOP_VIDEOS = [...TUTORIAL_VIDEOS, ...TUTORIAL_VIDEOS];

// Get or create a persistent session ID for anonymous interactions
function getSessionId(): string {
  try {
    let sid = localStorage.getItem('tutorial-session-id');
    if (!sid) {
      sid = crypto.randomUUID();
      localStorage.setItem('tutorial-session-id', sid);
    }
    return sid;
  } catch {
    return 'anon-' + Date.now();
  }
}

interface VideoSlideProps {
  video: TutorialVideo;
  index: number;
  originalIndex: number;
  total: number;
  isFirst: boolean;
  onActiveChange: (originalIndex: number) => void;
}

interface CommentData {
  id: number;
  autor: string;
  contenido: string;
  createdAt: string;
}

function VideoSlide({
  video,
  index,
  originalIndex,
  total,
  isFirst,
  onActiveChange,
}: VideoSlideProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const slideRef = useRef<HTMLDivElement>(null);
  const commentInputRef = useRef<HTMLInputElement>(null);
  const [showPauseIndicator, setShowPauseIndicator] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = 1;
    }
  }, []);

  // Like state
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [likeLoading, setLikeLoading] = useState(false);
  const sessionId = useMemo(() => getSessionId(), []);

  // Comment state
  const [comments, setComments] = useState<CommentData[]>([]);
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [commentAutor, setCommentAutor] = useState('');
  const [commentLoading, setCommentLoading] = useState(false);

  // Fetch likes + comments on mount
  useEffect(() => {
    let cancelled = false;
    async function fetchInteractions() {
      try {
        const res = await fetch(`${API_BASE}/api/tutorials/${video.id}`, {
          signal: AbortSignal.timeout?.(5000) ?? undefined,
        });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setLikeCount(data.likes ?? 0);
        setComments(data.comments ?? []);
      } catch {
        // API unavailable — use defaults
      }
    }
    fetchInteractions();

    // Also check if this session has liked
    async function fetchLiked() {
      try {
        const res = await fetch(
          `${API_BASE}/api/tutorials/${video.id}/liked?sessionId=${sessionId}`,
          { signal: AbortSignal.timeout?.(5000) ?? undefined }
        );
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setLiked(data.liked ?? false);
      } catch {
        // API unavailable
      }
    }
    fetchLiked();

    return () => {
      cancelled = true;
    };
  }, [video.id, sessionId]);

  // Accordion state per video — persisted in sessionStorage
  const STORAGE_KEY = `tutorial-caption-${video.id}`;
  const [isExpanded, setIsExpanded] = useState(() => {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      return stored !== null ? stored === 'true' : false;
    } catch {
      return false;
    }
  });

  const toggleExpanded = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setIsExpanded((prev) => {
        const next = !prev;
        try {
          sessionStorage.setItem(STORAGE_KEY, String(next));
        } catch {
          // sessionStorage may be unavailable
        }
        return next;
      });
    },
    [STORAGE_KEY]
  );

  const handleShare = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const url = window.location.href;
    if (navigator.share) {
      navigator.share({
        title: 'FER CUP — Tutoriales de Powerlifting',
        text: 'Aprende powerlifting con los tutoriales de la FER CUP',
        url,
      }).catch(() => {
        // User cancelled share
      });
    } else {
      // Fallback: copy to clipboard
      navigator.clipboard.writeText(url).catch(() => {});
    }
  }, []);

  // Like handler
  const handleLike = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (likeLoading) return;
      setLikeLoading(true);

      // Optimistic update
      setLiked((prev) => !prev);
      setLikeCount((prev) => (liked ? Math.max(0, prev - 1) : prev + 1));

      try {
        const res = await fetch(`${API_BASE}/api/tutorials/${video.id}/like`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId }),
        });
        if (!res.ok) {
          // Rollback on failure
          setLiked((prev) => !prev);
          setLikeCount((prev) => Math.max(0, prev - 1));
          return;
        }
        const data = await res.json();
        setLiked(data.liked ?? false);
        setLikeCount(data.likes ?? likeCount);
      } catch {
        // Rollback
        setLiked((prev) => !prev);
        setLikeCount((prev) => Math.max(0, prev - 1));
      } finally {
        setLikeLoading(false);
      }
    },
    [video.id, sessionId, likeLoading, liked, likeCount]
  );

  // Submit comment
  const handleSubmitComment = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!commentText.trim() || commentLoading) return;
      setCommentLoading(true);

      try {
        const res = await fetch(`${API_BASE}/api/tutorials/${video.id}/comment`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contenido: commentText.trim(),
            autor: commentAutor.trim() || undefined,
          }),
        });
        if (!res.ok) return;
        const data = await res.json();
        setComments((prev) => [
          { id: data.id, autor: data.autor, contenido: data.contenido, createdAt: data.createdAt },
          ...prev,
        ]);
        setCommentText('');
      } catch {
        // API unavailable
      } finally {
        setCommentLoading(false);
      }
    },
    [video.id, commentText, commentAutor, commentLoading]
  );

  // Track which slide is active
  useEffect(() => {
    const el = slideRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
            onActiveChange(originalIndex);
          }
        });
      },
      { threshold: [0.5] }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [originalIndex, onActiveChange]);

  // Auto-play when slide comes into view
  useEffect(() => {
    const el = slideRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const videoEl = videoRef.current;
          if (!videoEl) return;
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
            videoEl.play().catch(() => {});
            setIsPlaying(true);
          } else if (entry.intersectionRatio < 0.3) {
            videoEl.pause();
            videoEl.currentTime = 0;
            setIsPlaying(false);
          }
        });
      },
      { threshold: [0.3, 0.6] }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handleVideoClick = useCallback(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;
    if (videoEl.paused) {
      videoEl.play();
      setIsPlaying(true);
      setShowPauseIndicator(false);
    } else {
      videoEl.pause();
      setIsPlaying(false);
      setShowPauseIndicator(true);
      setTimeout(() => setShowPauseIndicator(false), 800);
    }
  }, []);

  return (
    <article
      data-ui={`tiktok-slide-${originalIndex}`}
      ref={slideRef}
      className="h-[88dvh] max-h-[88dvh] w-full flex items-center justify-center snap-start relative bg-black"
    >
      {/* Gradient overlay for readability */}
      <div
        data-ui={`gradient-overlay-${originalIndex}`}
        className="absolute inset-0 z-[1] pointer-events-none"
        style={{
          background:
            'linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, transparent 30%, transparent 60%, rgba(0,0,0,0.6) 85%, rgba(0,0,0,0.9) 100%)',
        }}
      />

      {/* Video wrapper */}
      <div
        data-ui={`tiktok-video-wrapper-${originalIndex}`}
        className="relative flex items-center justify-center h-full w-full"
      >
        <video
          ref={videoRef}
          id={`video-${video.id}-${index}`}
          data-ui={`tiktok-video-${originalIndex}`}
          className="h-full w-auto aspect-[9/16] max-h-full object-contain"
          playsInline
          loop
          preload="metadata"
          onClick={handleVideoClick}
        >
          <source src={video.url} type="video/mp4" />
        </video>
      </div>

      {/* Pause/Play indicator */}
      {showPauseIndicator && (
        <div
          data-ui={`pause-indicator-${originalIndex}`}
          className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none"
        >
          <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center animate-ping-once">
            {isPlaying ? (
              <svg width="28" height="28" viewBox="0 0 24 24" fill="white">
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
            ) : (
              <polygon points="8,5 19,12 8,19" fill="white" />
            )}
          </div>
        </div>
      )}

      {/* Top-left: Title with gradient glow */}
      <div
        data-ui={`tiktok-overlay-top-${originalIndex}`}
        className="absolute top-6 left-4 sm:top-8 sm:left-6 z-10 max-w-[75%]"
      >
        <h2
          data-ui={`tiktok-title-${originalIndex}`}
          className="text-lg sm:text-xl font-extrabold text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)] leading-tight"
          style={{
            textShadow: '0 0 30px rgba(0,0,0,0.6), 0 2px 4px rgba(0,0,0,0.8)',
          }}
        >
          {video.title}
        </h2>
      </div>

      {/* Top-right: Video counter */}
      <div
        data-ui={`tiktok-counter-${originalIndex}`}
        className="absolute top-6 right-4 sm:top-8 sm:right-6 z-10"
      >
        <span className="bg-black/40 backdrop-blur-md rounded-full px-3 py-1 text-xs font-semibold text-white/90 tracking-wider border border-white/10">
          {originalIndex + 1} / {total}
        </span>
      </div>

      {/* Right side: Action buttons */}
      <div
        data-ui={`tiktok-actions-${originalIndex}`}
        className="absolute right-2 sm:right-3 bottom-28 sm:bottom-32 z-10 flex flex-col items-center gap-5"
      >
        {/* Like */}
        <button
          data-ui={`tiktok-like-btn-${originalIndex}`}
          className="flex flex-col items-center gap-1 text-white/80 hover:text-white transition-colors"
          onClick={handleLike}
        >
          <div
            className={`w-10 h-10 rounded-full backdrop-blur-sm flex items-center justify-center transition-all ${
              liked
                ? 'bg-[#fe2c55]/30 text-[#fe2c55]'
                : 'bg-black/30 text-white/80 hover:bg-black/50'
            }`}
          >
            <Heart
              size={22}
              className="drop-shadow-lg transition-all"
              fill={liked ? '#fe2c55' : 'transparent'}
            />
          </div>
          <span className="text-[10px] font-semibold">{likeCount}</span>
        </button>

        {/* Comment */}
        <button
          data-ui={`tiktok-comment-btn-${originalIndex}`}
          className="flex flex-col items-center gap-1 text-white/80 hover:text-white transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            setShowComments((prev) => !prev);
          }}
        >
          <div className="w-10 h-10 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center hover:bg-black/50 transition-all">
            <MessageCircle size={22} className="drop-shadow-lg" />
          </div>
          <span className="text-[10px] font-semibold">{comments.length}</span>
        </button>

        {/* Share — native Web Share API */}
        <button
          data-ui={`tiktok-share-btn-${originalIndex}`}
          className="flex flex-col items-center gap-1 text-white/80 hover:text-white transition-colors"
          onClick={handleShare}
        >
          <div className="w-10 h-10 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center hover:bg-black/50 transition-all">
            <Share2 size={20} className="drop-shadow-lg" />
          </div>
          <span className="text-[10px] font-semibold">Compartir</span>
        </button>
      </div>

      {/* Comments panel (overlay) */}
      {showComments && (
        <div
          data-ui={`tiktok-comments-panel-${originalIndex}`}
          className="absolute inset-0 z-30 flex flex-col bg-black/80 backdrop-blur-sm"
          onClick={(e) => {
            e.stopPropagation();
            setShowComments(false);
          }}
        >
          <div
            className="flex flex-col h-full mt-14"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <h3 className="text-white font-bold text-base">Comentarios</h3>
              <button
                data-ui={`tiktok-comments-close-${originalIndex}`}
                onClick={() => setShowComments(false)}
                className="text-white/60 hover:text-white text-sm font-medium"
              >
                Cerrar
              </button>
            </div>

            {/* Comment list */}
            <div className="flex-1 overflow-y-auto px-4 py-2 space-y-3">
              {comments.length === 0 ? (
                <div className="text-white/40 text-center py-8 text-sm">
                  No hay comentarios todavía. ¡Sé el primero!
                </div>
              ) : (
                comments.map((c) => (
                  <div
                    key={c.id}
                    data-ui={`tiktok-comment-item-${c.id}`}
                    className="bg-white/5 rounded-lg px-3 py-2.5"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-6 h-6 rounded-full bg-[#fe2c55]/30 flex items-center justify-center text-[10px] font-bold text-white">
                        {c.autor.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-xs font-semibold text-white/80">
                        {c.autor}
                      </span>
                      <span className="text-[10px] text-white/30 ml-auto">
                        {new Date(c.createdAt).toLocaleDateString('es-ES', {
                          day: 'numeric',
                          month: 'short',
                        })}
                      </span>
                    </div>
                    <p className="text-sm text-white/80 leading-relaxed ml-8">
                      {c.contenido}
                    </p>
                  </div>
                ))
              )}
            </div>

            {/* Comment input */}
            <form
              onSubmit={handleSubmitComment}
              className="border-t border-white/10 px-4 py-3 flex flex-col gap-2"
            >
              <input
                ref={commentInputRef}
                type="text"
                placeholder="Tu nombre (opcional)"
                value={commentAutor}
                onChange={(e) => setCommentAutor(e.target.value)}
                maxLength={100}
                className="w-full bg-white/5 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:ring-1 focus:ring-[#fe2c55]/50 border border-white/10"
                data-ui={`tiktok-comment-name-${originalIndex}`}
              />
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Escribe un comentario..."
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  maxLength={500}
                  required
                  className="flex-1 bg-white/5 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:ring-1 focus:ring-[#fe2c55]/50 border border-white/10"
                  data-ui={`tiktok-comment-input-${originalIndex}`}
                />
                <button
                  type="submit"
                  disabled={!commentText.trim() || commentLoading}
                  className="px-3 py-2 rounded-lg bg-[#fe2c55] text-white disabled:opacity-40 hover:bg-[#e01e4a] transition-all active:scale-95"
                  data-ui={`tiktok-comment-submit-${originalIndex}`}
                >
                  <Send size={16} />
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bottom: Description and hashtags — collapsible accordion */}
      <div
        data-ui={`tiktok-overlay-bottom-${originalIndex}`}
        className="absolute bottom-4 left-3 right-16 sm:left-4 sm:right-20 z-10"
      >
        <div className="bg-black/40 backdrop-blur-lg rounded-xl border border-white/10 overflow-hidden transition-all duration-300">
          {/* Accordion header — always visible */}
          <div className="flex items-start justify-between gap-2 px-3.5 py-2.5">
            <div className="flex-1 min-w-0">
              {isExpanded && video.hashtags && (
                <p
                  data-ui={`tiktok-hashtags-${originalIndex}`}
                  className="text-xs sm:text-sm font-semibold text-[#fe2c55] drop-shadow-md mb-1"
                >
                  {video.hashtags}
                </p>
              )}
              <p
                data-ui={`tiktok-description-${originalIndex}`}
                className={`text-sm sm:text-base font-medium text-white/90 drop-shadow-md leading-relaxed ${
                  isExpanded ? '' : 'line-clamp-1'
                }`}
              >
                {video.description}
              </p>
            </div>
            {/* Chevron toggle button */}
            <button
              data-ui={`tiktok-accordion-toggle-${originalIndex}`}
              onClick={toggleExpanded}
              className="flex-shrink-0 w-7 h-7 mt-0.5 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center hover:bg-white/20 transition-all active:scale-90"
              aria-label={isExpanded ? 'Collapse caption' : 'Expand caption'}
            >
              <ChevronUp
                size={16}
                className="text-white/70 transition-transform duration-300"
                style={{ transform: isExpanded ? 'rotate(0deg)' : 'rotate(180deg)' }}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Scroll indicator on first video */}
      {isFirst && (
        <div
          data-ui="tiktok-scroll-indicator"
          className="absolute bottom-16 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center pointer-events-none"
        >
          <span
            data-ui="tiktok-scroll-text"
            className="text-[10px] font-semibold text-white/50 tracking-[0.2em] uppercase mb-2 animate-pulse"
          >
            Desliza
          </span>
          <div className="flex flex-col items-center gap-1">
            <div className="w-1 h-1 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: '0s' }} />
            <div className="w-1 h-1 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: '0.15s' }} />
            <div className="w-1 h-1 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: '0.3s' }} />
          </div>
        </div>
      )}
    </article>
  );
}

function TikTokVideoList() {
  const slides = useMemo(
    () =>
      LOOP_VIDEOS.map((video, index) => {
        const originalIndex = index % TOTAL_VIDEOS;
        return (
          <VideoSlide
            key={`${video.id}-${index}`}
            video={video}
            index={index}
            originalIndex={originalIndex}
            total={TOTAL_VIDEOS}
            isFirst={index === 0}
            onActiveChange={() => {}}
          />
        );
      }),
    []
  );

  return (
    <div
      data-ui="tiktok-container"
      className="overflow-y-scroll snap-y snap-mandatory h-[88dvh] max-h-[88dvh] scrollbar-thin"
    >
      {slides}
    </div>
  );
}

export function TutorialesPage() {
  return (
    <>
      <Head
        title="Tutoriales | FER CUP"
        description="Tutoriales en vídeo para aprender cómo funciona el sistema de marcas del FER CUP"
      />
      <main
        data-ui="tutoriales-page"
        className="min-h-screen w-full flex items-center justify-center bg-[#0a0a0a]"
      >
        <div className="w-full max-w-md mx-auto h-[88dvh] max-h-[88dvh] sm:rounded-2xl sm:shadow-2xl sm:shadow-black/60 sm:border sm:border-white/5 sm:overflow-hidden relative">
          <TikTokVideoList />
        </div>
      </main>
    </>
  );
}

export default TutorialesPage;
