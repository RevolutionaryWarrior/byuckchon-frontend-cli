function messageText(message) {
  if (typeof message?.text === 'string') return message.text;
  if (typeof message?.content === 'string') return message.content;
  if (Array.isArray(message?.content)) {
    return message.content.find((part) => part.type === 'text')?.text ?? '[이미지 첨부]';
  }
  return '';
}

export function findLastRetryableUser(messages) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === 'user' && messageText(message).trim()) {
      return { index, message, text: messageText(message) };
    }
  }
  return null;
}

export function formatSessionList(sessions, { limit = 10 } = {}) {
  if (!sessions.length) return '저장된 이전 세션이 없습니다.';
  return sessions
    .slice(0, limit)
    .map((session) => {
      const when = session.updatedAt?.replace('T', ' ').slice(0, 19) ?? '';
      const preview = session.preview || '(빈 세션)';
      return `${session.id}  ${when}  ${session.turns} turns\n  ${preview}`;
    })
    .join('\n');
}
