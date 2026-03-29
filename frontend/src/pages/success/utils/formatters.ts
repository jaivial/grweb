// Success page formatters

/**
 * Formats a price in euros
 */
export function formatPrice(price: number): string {
  return new Intl.NumberFormat('en-EU', {
    style: 'currency',
    currency: 'EUR',
  }).format(price);
}

/**
 * Formats ticket count
 */
export function formatTicketCount(count: number): string {
  if (count === 1) return '1 ticket';
  return `${count} tickets`;
}

/**
 * Formats a full name
 */
export function formatFullName(firstName: string, surname: string): string {
  return `${firstName} ${surname}`;
}

/**
 * Formats Instagram username (ensures @ prefix)
 */
export function formatInstagram(username: string): string {
  return username.startsWith('@') ? username : `@${username}`;
}

/**
 * Generates a share message for social media
 */
export function generateShareMessage(ticketCount: number): string {
  if (ticketCount === 1) {
    return `I just entered the GR Cup 2026 Raffle! 🎉 Good luck to everyone! #GRCup #Powerlifting`;
  }
  return `I just got ${ticketCount} tickets for the GR Cup 2026 Raffle! 🎉 #GRCup #Powerlifting`;
}

/**
 * Gets the Twitter share URL
 */
export function getTwitterShareUrl(message: string): string {
  const text = encodeURIComponent(message);
  return `https://twitter.com/intent/tweet?text=${text}`;
}

/**
 * Gets the Facebook share URL
 */
export function getFacebookShareUrl(): string {
  return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(window.location.origin)}`;
}
