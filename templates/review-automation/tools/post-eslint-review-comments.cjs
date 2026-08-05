'use strict';

const crypto = require('crypto');
const fs = require('fs');
const https = require('https');
const path = require('path');

const COMMENT_MARKER = 'eslint-convention-review';
const USER_AGENT = 'eslint-convention-review';
const [rdjsonPath, sourceName = 'eslint-conventions', maybeDryRun] =
  process.argv.slice(2);
const dryRun = maybeDryRun === '--dry-run';

if (!rdjsonPath) {
  throw new Error('Usage: node post-eslint-review-comments.cjs <rdjson-path>');
}

function readDiagnostics() {
  const payload = JSON.parse(fs.readFileSync(rdjsonPath, 'utf8'));

  return Array.isArray(payload.diagnostics) ? payload.diagnostics : [];
}

function severityLabel(diagnostic) {
  const ruleId = diagnostic.code && diagnostic.code.value;

  if (ruleId === 'internal/blocking-conventions') {
    return 'BLOCKING';
  }

  if (diagnostic.severity === 'ERROR') {
    return 'BLOCKING';
  }

  return 'WARNING';
}

function markerKey(diagnostic) {
  const start = diagnostic.location.range.start;
  const identity = {
    path: diagnostic.location.path,
    line: start.line,
    column: start.column,
    rule: diagnostic.code && diagnostic.code.value,
    message: diagnostic.message,
    source: sourceName,
  };

  return crypto
    .createHash('sha256')
    .update(JSON.stringify(identity))
    .digest('hex')
    .slice(0, 24);
}

function commentBody(diagnostic, key) {
  const severity = severityLabel(diagnostic);
  const icon = severity === 'BLOCKING' ? '🚫' : '⚠️';
  const ruleId = diagnostic.code && diagnostic.code.value;

  return [
    `${icon} **${severity}** — \`${ruleId}\``,
    '',
    diagnostic.message,
    '',
    `<!-- ${COMMENT_MARKER}:${key} -->`,
  ].join('\n');
}

function api(method, apiPath, body) {
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  const repo = process.env.REPO || process.env.GITHUB_REPOSITORY;

  if (!token || !repo) {
    throw new Error(
      'GH_TOKEN/GITHUB_TOKEN and REPO/GITHUB_REPOSITORY are required',
    );
  }

  const requestBody = body ? JSON.stringify(body) : null;

  return new Promise((resolve, reject) => {
    const request = https.request(
      {
        hostname: 'api.github.com',
        path: `/repos/${repo}${apiPath}`,
        method,
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'User-Agent': USER_AGENT,
          'X-GitHub-Api-Version': '2022-11-28',
          ...(requestBody
            ? { 'Content-Length': Buffer.byteLength(requestBody) }
            : {}),
        },
      },
      (response) => {
        let responseBody = '';

        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          responseBody += chunk;
        });
        response.on('end', () => {
          const contentType = response.headers['content-type'] || '';
          const parsedBody =
            contentType.includes('application/json') && responseBody
              ? JSON.parse(responseBody)
              : responseBody;

          if (response.statusCode >= 200 && response.statusCode < 300) {
            resolve(parsedBody);
            return;
          }

          reject(
            new Error(
              `GitHub API ${response.statusCode} ${method} ${apiPath}: ${responseBody.slice(
                0,
                500,
              )}`,
            ),
          );
        });
      },
    );

    request.on('error', reject);

    if (requestBody) {
      request.write(requestBody);
    }

    request.end();
  });
}

async function listPaginated(apiPath) {
  const items = [];

  for (let page = 1; ; page += 1) {
    const separator = apiPath.includes('?') ? '&' : '?';
    const result = await api(
      'GET',
      `${apiPath}${separator}per_page=100&page=${page}`,
    );

    if (!Array.isArray(result)) {
      return items;
    }

    items.push(...result);

    if (result.length < 100) {
      return items;
    }
  }
}

function isActionsBot(comment) {
  return comment.user && comment.user.login === 'github-actions[bot]';
}

async function main() {
  const diagnostics = readDiagnostics();
  const prNumber = process.env.PR_NUMBER;
  const headSha = process.env.HEAD_SHA;

  if (!prNumber || !headSha) {
    throw new Error('PR_NUMBER and HEAD_SHA are required');
  }

  const comments = diagnostics.map((diagnostic) => {
    const start = diagnostic.location.range.start;
    const key = markerKey(diagnostic);

    return {
      path: diagnostic.location.path.split(path.sep).join('/'),
      line: start.line || 1,
      side: 'RIGHT',
      body: commentBody(diagnostic, key),
      key,
      severity: severityLabel(diagnostic),
    };
  });

  const counts = comments.reduce(
    (accumulator, comment) => {
      accumulator[comment.severity] += 1;

      return accumulator;
    },
    { BLOCKING: 0, WARNING: 0 },
  );

  console.log(
    `Prepared ${comments.length} ESLint convention comment(s): ` +
      `${counts.BLOCKING} BLOCKING, ${counts.WARNING} WARNING`,
  );

  function failIfBlocking() {
    if (counts.BLOCKING === 0) {
      return;
    }

    console.log(
      `ESLint convention review found ${counts.BLOCKING} BLOCKING issue(s).`,
    );
    process.exitCode = 1;
  }

  if (dryRun || comments.length === 0) {
    return;
  }

  const existingComments = await listPaginated(`/pulls/${prNumber}/comments`);
  const markerPattern = new RegExp(`<!-- ${COMMENT_MARKER}:([0-9a-f]{24}) -->`);
  const existingByKey = new Map();

  for (const comment of existingComments) {
    if (!isActionsBot(comment)) {
      continue;
    }

    const match = markerPattern.exec(comment.body || '');

    if (match) {
      existingByKey.set(match[1], comment);
    }
  }

  const commentsToPost = [];

  for (const comment of comments) {
    const existingComment = existingByKey.get(comment.key);

    if (!existingComment) {
      commentsToPost.push(comment);
      continue;
    }

    if ((existingComment.body || '').trim() !== comment.body.trim()) {
      await api('PATCH', `/pulls/comments/${existingComment.id}`, {
        body: comment.body,
      });
    }
  }

  if (commentsToPost.length === 0) {
    console.log('No new ESLint convention comments to post.');
    failIfBlocking();
    return;
  }

  try {
    await api('POST', `/pulls/${prNumber}/reviews`, {
      commit_id: headSha,
      body: 'ESLint 컨벤션 리뷰 코멘트',
      event: 'COMMENT',
      comments: commentsToPost.map((comment) => ({
        path: comment.path,
        line: comment.line,
        side: comment.side,
        body: comment.body,
      })),
    });
    console.log(
      `Posted ${commentsToPost.length} ESLint convention review comment(s).`,
    );
    failIfBlocking();
    return;
  } catch (error) {
    console.log(`Batch review failed: ${error.message}`);
    console.log('Retrying ESLint convention comments one by one.');
  }

  let posted = 0;

  for (const comment of commentsToPost) {
    try {
      await api('POST', `/pulls/${prNumber}/comments`, {
        commit_id: headSha,
        path: comment.path,
        line: comment.line,
        side: comment.side,
        body: comment.body,
      });
      posted += 1;
    } catch (lineError) {
      await api('POST', `/pulls/${prNumber}/comments`, {
        commit_id: headSha,
        path: comment.path,
        subject_type: 'file',
        body: `${comment.body}\n\n원래 위치: line ${comment.line}`,
      });
      posted += 1;
    }
  }

  console.log(`Posted ${posted} ESLint convention comment(s).`);
  failIfBlocking();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
