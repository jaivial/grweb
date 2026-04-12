import { describe, it, expect } from 'vitest';
import { formatDate } from '../pdfExport';

describe('formatDate', () => {
  it('formats a date-only string (YYYY-MM-DD)', () => {
    const result = formatDate('2024-03-29');
    expect(result).toMatch(/29/);
    expect(result).toMatch(/mar|mar\.|marzo/i);
    expect(result).toContain('2024');
    expect(result).not.toBe('Invalid Date');
  });

  it('formats an ISO datetime string without producing Invalid Date', () => {
    // This is the format the backend sends for registrationDate
    const result = formatDate('2024-03-29T19:21:55.000Z');
    expect(result).not.toBe('Invalid Date');
    expect(result).toMatch(/29/);
    expect(result).toMatch(/mar|mar\.|marzo/i);
    expect(result).toContain('2024');
  });

  it('formats an ISO datetime string with timezone offset', () => {
    const result = formatDate('2024-01-15T10:30:00+01:00');
    expect(result).not.toBe('Invalid Date');
    expect(result).toMatch(/15/);
    expect(result).toContain('2024');
  });

  it('handles a date string that already has a time component', () => {
    const result = formatDate('2024-12-25T00:00:00');
    expect(result).not.toBe('Invalid Date');
    expect(result).toMatch(/25/);
    expect(result).toContain('2024');
  });
});
