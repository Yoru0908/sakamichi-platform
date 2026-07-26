export type CalendarEvent = {
  uid: string;
  title: string;
  description: string;
  location: string;
  startAt: string;
  endAt: string;
  url?: string;
  updatedAt?: string;
  sequence?: number;
};

export type CalendarOptions = {
  name?: string;
  description?: string;
  refreshInterval?: string;
};

const encoder = new TextEncoder();

export function toUtcCalendarString(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid calendar date: ${value}`);
  }
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

export function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = {
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    nbsp: ' ',
    quot: '"',
  };

  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      const codePoint = Number.parseInt(entity.slice(2), 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    if (entity.startsWith('#')) {
      const codePoint = Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    return named[entity.toLowerCase()] ?? match;
  });
}

/**
 * Fortune Music stores reception windows as Japanese display strings.
 * Return an ISO-8601 value with JST offset so calendar conversion remains
 * independent of the Worker runtime's timezone.
 */
export function normalizeCalendarDate(value: string): string | null {
  const trimmed = value.trim();
  const japanese = trimmed.match(
    /^(\d{4})年(\d{1,2})月(\d{1,2})日(?:（[^）]+）|\([^)]*\))?\s*(\d{1,2}):(\d{2})$/,
  );
  if (japanese) {
    const [, year, month, day, hour, minute] = japanese;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour.padStart(2, '0')}:${minute}:00+09:00`;
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function foldIcsLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let currentBytes = 0;

  for (const char of line) {
    const charBytes = encoder.encode(char).length;
    if (current && currentBytes + charBytes > 75) {
      result.push(current);
      current = ` ${char}`;
      currentBytes = 1 + charBytes;
    } else {
      current += char;
      currentBytes += charBytes;
    }
  }

  result.push(current);
  return result;
}

export function buildIcsCalendar(
  events: CalendarEvent[],
  options: CalendarOptions = {},
): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//46log//Miguri Calendar//JA',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];

  if (options.name) {
    lines.push(`X-WR-CALNAME:${escapeIcsText(options.name)}`);
  }
  if (options.description) {
    lines.push(`X-WR-CALDESC:${escapeIcsText(options.description)}`);
  }
  if (options.refreshInterval) {
    lines.push(
      `REFRESH-INTERVAL;VALUE=DURATION:${options.refreshInterval}`,
      `X-PUBLISHED-TTL:${options.refreshInterval}`,
    );
  }

  const generatedAt = toUtcCalendarString(new Date().toISOString());
  for (const event of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${escapeIcsText(event.uid)}`,
      `DTSTAMP:${generatedAt}`,
      `DTSTART:${toUtcCalendarString(event.startAt)}`,
      `DTEND:${toUtcCalendarString(event.endAt)}`,
      `SUMMARY:${escapeIcsText(decodeHtmlEntities(event.title))}`,
      `DESCRIPTION:${escapeIcsText(decodeHtmlEntities(event.description))}`,
      `LOCATION:${escapeIcsText(event.location)}`,
      `SEQUENCE:${Math.max(0, event.sequence || 0)}`,
      'STATUS:CONFIRMED',
      'TRANSP:OPAQUE',
    );
    if (event.updatedAt) {
      lines.push(`LAST-MODIFIED:${toUtcCalendarString(event.updatedAt)}`);
    }
    if (event.url) {
      lines.push(`URL:${escapeIcsText(event.url)}`);
    }
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return `${lines.flatMap(foldIcsLine).join('\r\n')}\r\n`;
}
