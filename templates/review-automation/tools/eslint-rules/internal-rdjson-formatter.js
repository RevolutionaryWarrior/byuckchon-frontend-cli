'use strict';

const path = require('path');

const REVIEW_COMMENT_RULE_IDS = new Set([
  'internal/blocking-conventions',
  'internal/warning-conventions',
  'react/self-closing-comp',
]);

function toRepositoryPath(filePath) {
  const basePath = process.env.GITHUB_WORKSPACE || process.cwd();
  const relativePath = path.relative(basePath, filePath);

  return relativePath.split(path.sep).join('/');
}

function toPosition(line, column) {
  return {
    line: line || 1,
    column: column || 1,
  };
}

module.exports = function format(results) {
  const diagnostics = [];

  for (const result of results) {
    for (const message of result.messages) {
      if (!REVIEW_COMMENT_RULE_IDS.has(message.ruleId)) {
        continue;
      }

      diagnostics.push({
        message: message.message,
        location: {
          path: toRepositoryPath(result.filePath),
          range: {
            start: toPosition(message.line, message.column),
            end: toPosition(
              message.endLine || message.line,
              message.endColumn || message.column,
            ),
          },
        },
        severity: message.severity === 2 ? 'ERROR' : 'WARNING',
        code: {
          value: message.ruleId,
        },
      });
    }
  }

  return JSON.stringify({
    source: {
      name: 'eslint-conventions',
    },
    diagnostics,
  });
};
