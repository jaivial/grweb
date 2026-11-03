/**
 * YouTube / Twitch link → embeddable player URL (anything else is not embedded). YouTube goes through youtube-nocookie;
 * `autoplay` (live only) starts it muted. Accepted: watch?v=, /live/ID, /embed/ID, /shorts/ID, youtu.be/ID, a channel's
 * live (/channel/UC…/live) and Twitch channels — the same list the backend validates.
 */
export function embedVideo(url: string | undefined, host: string, autoplay = false): string | null {
  if (!url) return null;
  const yt = (id: string) => `https://www.youtube-nocookie.com/embed/${id}${id.includes('?') ? '&' : '?'}rel=0&modestbranding=1${autoplay ? '&autoplay=1&mute=1' : ''}`;
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return null; // the backend accepts https links only
    const h = u.hostname.replace(/^(www|m)\./, '');
    const partes = u.pathname.split('/').filter(Boolean);
    if (h === 'youtube.com' || h === 'youtube-nocookie.com') {
      if (u.pathname === '/watch') { const v = u.searchParams.get('v'); return v ? yt(v) : null; }
      if (partes.length === 2 && ['live', 'embed', 'shorts'].includes(partes[0]) && partes[1] !== 'live_stream') return yt(partes[1]);
      if (partes[0] === 'channel' && partes[1]?.startsWith('UC')) return yt(`live_stream?channel=${partes[1]}`);
      return null;
    }
    if (h === 'youtu.be' && partes.length === 1) return yt(partes[0]);
    if (h === 'twitch.tv' && partes.length === 1) return `https://player.twitch.tv/?channel=${partes[0]}&parent=${host}&muted=true&autoplay=${autoplay}`;
  } catch { /* not a URL */ }
  return null;
}

/** What kind of link it is (for the backoffice check). */
export const tipoVideo = (url: string): 'youtube' | 'twitch' | null => {
  const u = embedVideo(url, 'localhost');
  return !u ? null : u.includes('twitch') ? 'twitch' : 'youtube';
};
