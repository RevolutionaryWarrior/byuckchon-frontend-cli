'use strict';

const path = require('path');

function normalizeFilename(filename) {
  return filename.split(path.sep).join('/');
}

function isApiIndexFile(filename) {
  return /\/api\/index\.tsx?$/.test(filename);
}

module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Internal warning conventions from CLAUDE.md',
    },
    schema: [],
  },

  create(context) {
    const filename = normalizeFilename(context.getFilename());

    function report(node, message) {
      context.report({ node, message });
    }

    return {
      ExportAllDeclaration(node) {
        if (!isApiIndexFile(filename) || !node.source || !node.source.value) {
          return;
        }

        if (/\.(?:api|zod)$/.test(node.source.value)) {
          report(
            node.source,
            'api index.ts에서는 service와 type 외 api/zod export에 근거가 필요합니다.',
          );
        }
      },

      ExportNamedDeclaration(node) {
        if (!isApiIndexFile(filename) || !node.source || !node.source.value) {
          return;
        }

        if (/\.(?:api|zod)$/.test(node.source.value)) {
          report(
            node.source,
            'api index.ts에서는 service와 type 외 api/zod export에 근거가 필요합니다.',
          );
        }
      },
    };
  },
};
