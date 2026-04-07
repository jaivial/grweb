// Success page formatters

/**
 * Formats a price in euros
 */
export function formatPrice(price: number): string {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
  }).format(price);
}

/**
 * Formats ticket count
 */
export function formatTicketCount(count: number): string {
  if (count === 1) return '1 boleto';
  return `${count} boletos`;
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
    return `Acabo de entrar en el sorteo de la GRStrength Cup 2026. Suerte a todos. #GRCup #Powerlifting`;
  }
  return `Acabo de comprar ${ticketCount} boletos para el sorteo de la GRStrength Cup 2026. #GRCup #Powerlifting`;
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
