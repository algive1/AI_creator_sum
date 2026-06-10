const ALLOWED_TAGS = new Set([
  'a', 'b', 'blockquote', 'br', 'code', 'div', 'em', 'h1', 'h2', 'h3', 'h4',
  'h5', 'h6', 'hr', 'i', 'img', 'li', 'ol', 'p', 'pre', 's', 'span', 'strong',
  'table', 'tbody', 'td', 'th', 'thead', 'tr', 'u', 'ul',
]);

const VOID_TAGS = new Set(['br', 'hr', 'img']);
const DANGEROUS_BLOCK_PATTERN = /<\s*(script|style|iframe|object|embed|svg|math|template|noscript)\b[\s\S]*?<\s*\/\s*\1\s*>/gi;
const TAG_PATTERN = /<\s*(\/)?\s*([a-zA-Z][a-zA-Z0-9-]*)([^>]*)>/g;
const ATTR_PATTERN = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
const GLOBAL_ATTRS = new Set(['title']);

const TAG_ATTRS: Record<string, Set<string>> = {
  a: new Set(['href', 'target', 'title']),
  img: new Set(['src', 'alt', 'title', 'width', 'height']),
  td: new Set(['colspan', 'rowspan', 'title']),
  th: new Set(['colspan', 'rowspan', 'title']),
};

export function sanitizeHelpHtml(input: string): string {
  const protectedTags: string[] = [];
  const source = String(input || '')
    .split('\u0000').join('')
    .replace(DANGEROUS_BLOCK_PATTERN, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  const withMarkers = source.replace(TAG_PATTERN, (_raw, closing: string, rawName: string, rawAttrs: string) => {
    const tagName = rawName.toLowerCase();
    if (!ALLOWED_TAGS.has(tagName)) return '';
    if (closing) return VOID_TAGS.has(tagName) ? '' : protectTag(`</${tagName}>`, protectedTags);

    const attrs = sanitizeAttributes(tagName, String(rawAttrs || ''));
    if (tagName === 'img' && !attrs.has('src')) return '';

    return protectTag(`<${tagName}${attrs.text ? ` ${attrs.text}` : ''}>`, protectedTags);
  });

  let sanitized = escapeHtmlText(withMarkers);
  protectedTags.forEach((tag, index) => {
    sanitized = sanitized.split(tagMarker(index)).join(tag);
  });

  return sanitized.trim();
}

function protectTag(tag: string, tags: string[]): string {
  const index = tags.push(tag) - 1;
  return tagMarker(index);
}

function tagMarker(index: number): string {
  return `\u0000HTML_TAG_${index}\u0000`;
}

function sanitizeAttributes(tagName: string, rawAttrs: string): { text: string; has: (name: string) => boolean } {
  const attrs = new Map<string, string>();
  let match: RegExpExecArray | null;

  while ((match = ATTR_PATTERN.exec(rawAttrs)) !== null) {
    const attrName = String(match[1] || '').toLowerCase();
    if (!isAllowedAttr(tagName, attrName)) continue;

    const rawValue = match[2] ?? match[3] ?? match[4] ?? '';
    const value = sanitizeAttrValue(tagName, attrName, rawValue);
    if (value !== null) attrs.set(attrName, value);
  }

  if (tagName === 'a' && attrs.get('target') === '_blank') {
    attrs.set('rel', 'noopener noreferrer');
  }

  return {
    text: Array.from(attrs.entries()).map(([name, value]) => `${name}="${escapeHtmlAttr(value)}"`).join(' '),
    has: (name: string) => attrs.has(name),
  };
}

function isAllowedAttr(tagName: string, attrName: string): boolean {
  if (!attrName || attrName.startsWith('on') || attrName.includes(':') || attrName === 'style') return false;
  return GLOBAL_ATTRS.has(attrName) || !!TAG_ATTRS[tagName]?.has(attrName) || (tagName === 'a' && attrName === 'rel');
}

function sanitizeAttrValue(tagName: string, attrName: string, rawValue: string): string | null {
  const value = decodeHtmlEntities(String(rawValue || '')).trim();
  if (!value) return attrName === 'alt' || attrName === 'title' ? '' : null;

  if (attrName === 'href') return safeUrl(value, new Set(['http:', 'https:', 'mailto:']), true, true);
  if (attrName === 'src') return safeUrl(value, new Set(['http:', 'https:']), true, false);
  if (attrName === 'target') return ['_blank', '_self'].includes(value) ? value : null;
  if (attrName === 'width' || attrName === 'height') return safePositiveInt(value, 2000);
  if (attrName === 'colspan' || attrName === 'rowspan') return safePositiveInt(value, 50);
  if (tagName === 'a' && attrName === 'rel') return null;

  return value.slice(0, 500);
}

function safeUrl(value: string, allowedProtocols: Set<string>, allowPath: boolean, allowHash: boolean): string | null {
  const compact = stripUrlControlAndSpace(value).toLowerCase();
  if (!compact || compact.startsWith('//')) return null;
  if (/^(javascript|data|vbscript):/.test(compact)) return null;
  if (allowHash && compact.startsWith('#')) return value;
  if (allowPath && compact.startsWith('/') && !compact.startsWith('//')) return value;

  const protocol = compact.match(/^([a-z][a-z0-9+.-]*):/)?.[1];
  if (!protocol) return null;
  return allowedProtocols.has(`${protocol}:`) ? value : null;
}

function stripUrlControlAndSpace(value: string): string {
  return Array.from(value).filter((char) => {
    const code = char.codePointAt(0) || 0;
    return code > 0x1f && code !== 0x7f && !/\s/.test(char);
  }).join('');
}

function safePositiveInt(value: string, max: number): string | null {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > max) return null;
  return String(parsed);
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&#(\d+);?/g, (_m, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);?/gi, (_m, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&colon;/gi, ':')
    .replace(/&tab;/gi, '\t')
    .replace(/&newline;/gi, '\n')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&');
}

function escapeHtmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeHtmlAttr(value: string): string {
  return escapeHtmlText(value).replace(/"/g, '&quot;');
}
