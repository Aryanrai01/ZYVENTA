import sanitizeHtml from 'sanitize-html';

/**
 * Allowlist sanitiser for seller-authored product descriptions. Anything not listed is removed
 * (scripts, styles, iframes, event handlers, javascript: URLs). Links are forced to open safely.
 */
const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'p',
    'br',
    'strong',
    'b',
    'em',
    'i',
    'u',
    's',
    'ul',
    'ol',
    'li',
    'h3',
    'h4',
    'blockquote',
    'hr',
    'a',
    'table',
    'thead',
    'tbody',
    'tr',
    'th',
    'td',
  ],
  // rel/target are set by transformTags below, never taken from input.
  allowedAttributes: {
    a: ['href', 'title', 'rel', 'target'],
    th: ['colspan', 'rowspan'],
    td: ['colspan', 'rowspan'],
  },
  allowedSchemes: ['https', 'mailto'],
  allowProtocolRelative: false,
  disallowedTagsMode: 'discard',
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', {
      rel: 'nofollow noopener noreferrer ugc',
      target: '_blank',
    }),
    b: 'strong',
    i: 'em',
    h1: 'h3',
    h2: 'h3',
  },
};

export function sanitizeDescription(html: string): string {
  return sanitizeHtml(html, OPTIONS).trim();
}

/** Plain text (for reviews, names): strips every tag. */
export function stripHtml(text: string): string {
  return sanitizeHtml(text, { allowedTags: [], allowedAttributes: {} }).trim();
}
