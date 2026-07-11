const DEFAULT_MAX_MESSAGES = 50;
const DEFAULT_MAX_MESSAGE_LENGTH = 500;

function stripSensitiveData(message: string): string {
  return message
    .replace(/https?:\/\/[^\s"'<>]+/gi, (rawUrl) => {
      try {
        const url = new URL(rawUrl);
        url.search = '';
        url.hash = '';
        return url.href;
      } catch {
        return '[url-redacted]';
      }
    })
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [Redacted]')
    .replace(
      /\b(token|access_token|authorization|api[_-]?key|session(?:id)?)\s*[:=]\s*[^\s,;]+/gi,
      '$1=[Redacted]',
    );
}

export function sanitizeDiagnosticMessages(
  messages: readonly string[],
  maxMessages = DEFAULT_MAX_MESSAGES,
  maxMessageLength = DEFAULT_MAX_MESSAGE_LENGTH,
): string[] {
  return messages
    .slice(0, maxMessages)
    .map((message) => stripSensitiveData(message).slice(0, maxMessageLength));
}
