'use strict';

const path = require('path');

const BOOLEAN_PREFIX_PATTERN = /^(is|has|can|should)[A-Z0-9]/;
const PASCAL_CASE_PATTERN = /^[A-Z][A-Za-z0-9]*$/;
const UPPER_SNAKE_CASE_PATTERN = /^[A-Z][A-Z0-9_]*$/;
const USE_HOOK_FILE_PATTERN = /^use[A-Z0-9][A-Za-z0-9]*$/;
const API_FILENAME_PATTERN =
  /^[A-Z][A-Za-z0-9]*\.(?:service|type|api|zod)$/;
const LOCAL_LAYER_ORDER = [
  'assets',
  'lib',
  'store',
  'api',
  'hooks',
  'context',
  'components',
  'layouts',
  'pages',
];

function normalizeFilename(filename) {
  return filename.split(path.sep).join('/');
}

function getBaseName(filename) {
  return path.basename(filename).replace(/\.(?:tsx?|jsx?)$/, '');
}

function getCalleeName(callee) {
  if (!callee) {
    return null;
  }

  if (callee.type === 'Identifier') {
    return callee.name;
  }

  if (callee.type === 'MemberExpression' && !callee.computed) {
    return getCalleeName(callee.property);
  }

  return null;
}

function getNodeName(node) {
  if (!node) {
    return null;
  }

  if (node.type === 'Identifier') {
    return node.name;
  }

  if (node.type === 'PrivateIdentifier') {
    return node.name;
  }

  return null;
}

function getPropertyName(node) {
  if (!node) {
    return null;
  }

  if (node.type === 'Identifier') {
    return node.name;
  }

  if (node.type === 'Literal') {
    return String(node.value);
  }

  return null;
}

function hasTypeParameters(node) {
  const parameters = node.typeParameters || node.typeArguments;

  return Boolean(
    parameters && parameters.params && parameters.params.length > 0,
  );
}

function getFirstTypeParameter(node) {
  const parameters = node.typeParameters || node.typeArguments;

  return parameters && parameters.params ? parameters.params[0] : null;
}

function getTypeReferenceName(typeNode) {
  if (!typeNode) {
    return null;
  }

  if (typeNode.type === 'TSTypeReference') {
    return getNodeName(typeNode.typeName);
  }

  if (typeNode.type === 'TSArrayType') {
    return 'Array';
  }

  if (typeNode.type === 'TSBooleanKeyword') {
    return 'boolean';
  }

  if (typeNode.type === 'TSStringKeyword') {
    return 'string';
  }

  if (typeNode.type === 'TSNumberKeyword') {
    return 'number';
  }

  return null;
}

function getIdentifierTypeNode(identifier) {
  return identifier && identifier.typeAnnotation
    ? identifier.typeAnnotation.typeAnnotation
    : null;
}

function isCallNamed(node, name) {
  return (
    node &&
    node.type === 'CallExpression' &&
    getCalleeName(node.callee) === name
  );
}

function isUseStateCall(node) {
  return isCallNamed(node, 'useState');
}

function isUseRefCall(node) {
  return isCallNamed(node, 'useRef');
}

function isUseEffectCall(node) {
  return isCallNamed(node, 'useEffect');
}

function isUseParamsCall(node) {
  const name = getCalleeName(node && node.callee);

  return name === 'useParams' || name === 'useLocalSearchParams';
}

function toSetterName(stateName) {
  return `set${stateName.charAt(0).toUpperCase()}${stateName.slice(1)}`;
}

function isBooleanTypeNode(typeNode) {
  return Boolean(typeNode && typeNode.type === 'TSBooleanKeyword');
}

function isFunctionNode(node) {
  return Boolean(
    node &&
    (node.type === 'FunctionDeclaration' ||
      node.type === 'FunctionExpression' ||
      node.type === 'ArrowFunctionExpression'),
  );
}

function isHookName(name) {
  return /^use[A-Z0-9]/.test(name);
}

function isBooleanExpression(node) {
  if (!node) {
    return false;
  }

  if (node.type === 'Literal' && typeof node.value === 'boolean') {
    return true;
  }

  if (node.type === 'UnaryExpression') {
    return node.operator === '!';
  }

  if (node.type === 'BinaryExpression') {
    return [
      '===',
      '!==',
      '==',
      '!=',
      '<',
      '<=',
      '>',
      '>=',
      'in',
      'instanceof',
    ].includes(node.operator);
  }

  return false;
}

function isLiteralOnlyExpression(node) {
  if (!node) {
    return false;
  }

  if (node.type === 'Literal') {
    return true;
  }

  if (node.type === 'TemplateLiteral') {
    return node.expressions.length === 0;
  }

  if (node.type === 'ArrayExpression') {
    return (
      node.elements.length > 0 && node.elements.every(isLiteralOnlyExpression)
    );
  }

  if (node.type === 'ObjectExpression') {
    return (
      node.properties.length > 0 &&
      node.properties.every(
        (property) =>
          property.type === 'Property' &&
          isLiteralOnlyExpression(property.value),
      )
    );
  }

  return false;
}

function isMutableRuntimeStore(node) {
  return Boolean(
    node &&
    node.type === 'NewExpression' &&
    ['Map', 'Set', 'WeakMap', 'WeakSet'].includes(getCalleeName(node.callee)),
  );
}

function isPluralName(name) {
  return /(?:s|ies)$/i.test(name);
}

function isLikelyArrayExpression(node) {
  return Boolean(node && node.type === 'ArrayExpression');
}

function isApiPath(filename) {
  return /\/api\//.test(filename);
}

function isApiServiceFile(filename) {
  return isApiPath(filename) && /\.service\.tsx?$/.test(filename);
}

function getSourceLayerFromImport(source) {
  if (!source || !source.startsWith('@/')) {
    return null;
  }

  return source.slice(2).split('/')[0] || null;
}

function getCurrentLayer(filename) {
  const match = filename.match(/\/src\/([^/]+)/);

  return match ? match[1] : null;
}

function getRecordStringAnyStatus(typeNode) {
  if (!typeNode || typeNode.type !== 'TSTypeReference') {
    return false;
  }

  if (getTypeReferenceName(typeNode) !== 'Record') {
    return false;
  }

  const parameters = typeNode.typeParameters || typeNode.typeArguments;

  if (!parameters || parameters.params.length !== 2) {
    return false;
  }

  const [firstType, secondType] = parameters.params;

  return (
    firstType.type === 'TSStringKeyword' && secondType.type === 'TSAnyKeyword'
  );
}

function containsNode(node, predicate) {
  const visited = new Set();

  function visit(currentNode) {
    if (!currentNode || typeof currentNode.type !== 'string') {
      return false;
    }

    if (visited.has(currentNode)) {
      return false;
    }

    visited.add(currentNode);

    if (predicate(currentNode)) {
      return true;
    }

    for (const key of Object.keys(currentNode)) {
      if (
        key === 'parent' ||
        key === 'loc' ||
        key === 'range' ||
        key === 'tokens' ||
        key === 'comments'
      ) {
        continue;
      }

      const value = currentNode[key];

      if (Array.isArray(value)) {
        if (value.some(visit)) {
          return true;
        }
      } else if (value && typeof value.type === 'string' && visit(value)) {
        return true;
      }
    }

    return false;
  }

  return visit(node);
}

function getTopLevelDeclarationName(node) {
  if (!node) {
    return null;
  }

  const declaration =
    node.type === 'ExportNamedDeclaration' ? node.declaration : node;

  if (!declaration) {
    return null;
  }

  if (
    declaration.type === 'TSInterfaceDeclaration' ||
    declaration.type === 'TSTypeAliasDeclaration'
  ) {
    return declaration.id.name;
  }

  if (declaration.type === 'FunctionDeclaration') {
    return declaration.id && declaration.id.name;
  }

  if (declaration.type === 'VariableDeclaration') {
    const firstDeclaration = declaration.declarations[0];

    return firstDeclaration && getNodeName(firstDeclaration.id);
  }

  return null;
}

function getDeclarationKind(node) {
  const declaration =
    node && node.type === 'ExportNamedDeclaration' ? node.declaration : node;

  return declaration ? declaration.type : null;
}

function findTopLevelDeclaration(programNode, name) {
  return programNode.body.find(
    (node) => getTopLevelDeclarationName(node) === name,
  );
}

function getPreviousNonImportNode(programNode, targetNode) {
  const index = programNode.body.indexOf(targetNode);

  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const node = programNode.body[cursor];

    if (node.type !== 'ImportDeclaration') {
      return node;
    }
  }

  return null;
}

function isDefaultExportFunction(exportNode) {
  return Boolean(
    exportNode &&
    exportNode.type === 'ExportDefaultDeclaration' &&
    exportNode.declaration &&
    exportNode.declaration.type === 'FunctionDeclaration',
  );
}

function getDefaultExportFunctionName(exportNode) {
  if (!isDefaultExportFunction(exportNode)) {
    return null;
  }

  return exportNode.declaration.id && exportNode.declaration.id.name;
}

function isReactComponentName(name) {
  return Boolean(name && /^[A-Z]/.test(name));
}

function getFunctionBodyStatements(functionNode) {
  return functionNode &&
    functionNode.body &&
    functionNode.body.type === 'BlockStatement'
    ? functionNode.body.body
    : [];
}

function hasPropsDestructuring(functionNode, propsName) {
  return getFunctionBodyStatements(functionNode).some((statement) => {
    if (statement.type !== 'VariableDeclaration') {
      return false;
    }

    return statement.declarations.some(
      (declaration) =>
        declaration.id.type === 'ObjectPattern' &&
        declaration.init &&
        declaration.init.type === 'Identifier' &&
        declaration.init.name === propsName,
    );
  });
}

function getUseQueryOptionsObject(node) {
  if (!isCallNamed(node, 'useQuery')) {
    return null;
  }

  const firstArg = node.arguments[0];

  return firstArg && firstArg.type === 'ObjectExpression' ? firstArg : null;
}

function isCacheConfigMember(node, finalPropertyName) {
  if (!node || node.type !== 'MemberExpression') {
    return false;
  }

  const propertyName = getPropertyName(node.property);

  if (finalPropertyName && propertyName !== finalPropertyName) {
    return false;
  }

  let rootNode = node.object;

  while (rootNode && rootNode.type === 'MemberExpression') {
    rootNode = rootNode.object;
  }

  return (
    rootNode &&
    rootNode.type === 'Identifier' &&
    rootNode.name === 'cacheConfig'
  );
}

function isQueryKeyMember(node) {
  if (!node || node.type !== 'MemberExpression') {
    return false;
  }

  let rootNode = node.object;

  while (rootNode && rootNode.type === 'MemberExpression') {
    rootNode = rootNode.object;
  }

  return (
    rootNode && rootNode.type === 'Identifier' && rootNode.name === 'queryKey'
  );
}

function isLiteralMathExpression(node) {
  if (!node) {
    return false;
  }

  if (node.type === 'Literal' && typeof node.value === 'number') {
    return true;
  }

  if (node.type === 'BinaryExpression') {
    return (
      isLiteralMathExpression(node.left) && isLiteralMathExpression(node.right)
    );
  }

  return false;
}

function getFunctionNameFromNode(node) {
  if (!node) {
    return null;
  }

  if (node.type === 'FunctionDeclaration') {
    return node.id && node.id.name;
  }

  if (
    node.type === 'VariableDeclarator' &&
    node.id.type === 'Identifier' &&
    isFunctionNode(node.init)
  ) {
    return node.id.name;
  }

  return null;
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Internal blocking conventions from CLAUDE.md',
    },
    schema: [],
  },

  create(context) {
    const sourceCode = context.getSourceCode();
    const filename = normalizeFilename(context.getFilename());
    const baseName = getBaseName(filename);
    const stateSetters = new Set();
    const apiImportNodes = [];
    let hasJsx = false;

    function report(node, message) {
      context.report({ node, message });
    }

    function checkUseStateDeclarator(node) {
      if (
        node.id.type !== 'ArrayPattern' ||
        !node.init ||
        !isUseStateCall(node.init)
      ) {
        return;
      }

      const [stateElement, setterElement] = node.id.elements;

      if (!hasTypeParameters(node.init)) {
        report(node.init, '`useState`는 제네릭 타입을 명시해야 합니다.');
      }

      if (
        stateElement &&
        stateElement.type === 'Identifier' &&
        setterElement &&
        setterElement.type === 'Identifier'
      ) {
        const expectedSetterName = toSetterName(stateElement.name);

        stateSetters.add(setterElement.name);

        if (setterElement.name !== expectedSetterName) {
          report(
            setterElement,
            `useState setter는 \`${expectedSetterName}\` 형식이어야 합니다.`,
          );
        }

        const firstTypeParameter = getFirstTypeParameter(node.init);
        const isBooleanState =
          isBooleanTypeNode(firstTypeParameter) ||
          (node.init.arguments[0] &&
            node.init.arguments[0].type === 'Literal' &&
            typeof node.init.arguments[0].value === 'boolean');

        if (isBooleanState && !BOOLEAN_PREFIX_PATTERN.test(stateElement.name)) {
          report(
            stateElement,
            'boolean useState 상태명은 is/has/can/should prefix를 사용해야 합니다.',
          );
        }
      }
    }

    function checkVariableDeclarator(node) {
      checkUseStateDeclarator(node);

      if (
        node.init &&
        isUseRefCall(node.init) &&
        !hasTypeParameters(node.init)
      ) {
        report(node.init, '`useRef`는 제네릭 타입을 명시해야 합니다.');
      }

      if (node.id.type !== 'Identifier') {
        return;
      }

      const name = node.id.name;
      const typeNode = getIdentifierTypeNode(node.id);

      if (
        name.startsWith('set') &&
        isFunctionNode(node.init) &&
        !stateSetters.has(name)
      ) {
        report(node.id, '`set` prefix는 useState setter에만 사용해야 합니다.');
      }

      const isBooleanVariable =
        isBooleanTypeNode(typeNode) || isBooleanExpression(node.init);

      if (isBooleanVariable && !BOOLEAN_PREFIX_PATTERN.test(name)) {
        report(
          node.id,
          'boolean 변수명은 is/has/can/should prefix를 사용해야 합니다.',
        );
      }

      if (
        BOOLEAN_PREFIX_PATTERN.test(name) &&
        typeNode &&
        !isBooleanTypeNode(typeNode)
      ) {
        report(
          node.id,
          'boolean이 아닌 변수에는 is/has/can/should prefix를 사용하지 않아야 합니다.',
        );
      }

      if (isLikelyArrayExpression(node.init) && !isPluralName(name)) {
        report(node.id, '배열 변수명은 복수형 명사를 사용해야 합니다.');
      }
    }

    function checkConstNaming(node) {
      if (node.kind !== 'const') {
        return;
      }

      for (const declaration of node.declarations) {
        if (
          declaration.id.type === 'Identifier' &&
          isLiteralOnlyExpression(declaration.init) &&
          !isMutableRuntimeStore(declaration.init) &&
          !UPPER_SNAKE_CASE_PATTERN.test(declaration.id.name)
        ) {
          report(
            declaration.id,
            '불변 상수명은 UPPER_SNAKE_CASE를 사용해야 합니다.',
          );
        }
      }
    }

    function checkClassNameAttribute(node) {
      if (!node.name || node.name.name !== 'className') {
        return;
      }

      if (!node.value || node.value.type !== 'JSXExpressionContainer') {
        return;
      }

      const expression = node.value.expression;

      if (!expression || expression.type !== 'TemplateLiteral') {
        return;
      }

      if (expression.expressions.length === 0) {
        report(
          node,
          'JavaScript 표현식이 없는 className은 문자열 리터럴로 작성해야 합니다.',
        );
        return;
      }

      const firstQuasi = expression.quasis[0];
      const firstText = firstQuasi && firstQuasi.value.raw.trim();

      if (firstText) {
        report(
          node,
          'Tailwind className의 동적 표현식은 문자열 맨 앞에 위치해야 합니다.',
        );
      }
    }

    function checkEventHandlerAttribute(node) {
      if (!node.name || typeof node.name.name !== 'string') {
        return;
      }

      const openingElement = node.parent;
      const elementName = openingElement && openingElement.name;

      if (
        !elementName ||
        elementName.type !== 'JSXIdentifier' ||
        !/^[a-z]/.test(elementName.name)
      ) {
        return;
      }

      const eventName = node.name.name;

      if (!/^on[A-Z]/.test(eventName)) {
        return;
      }

      if (!node.value || node.value.type !== 'JSXExpressionContainer') {
        return;
      }

      const expression = node.value.expression;

      if (!expression || expression.type !== 'Identifier') {
        return;
      }

      if (!expression.name.startsWith('on')) {
        report(expression, '웹 이벤트 핸들러는 on prefix를 사용해야 합니다.');
      }
    }

    function checkImportDeclaration(node) {
      const source = node.source.value;

      if (source === '@/api') {
        apiImportNodes.push(node);
      }

      if (typeof source === 'string' && source.startsWith('@/api/')) {
        report(node.source, '`@/api` 하위 경로 import는 금지됩니다.');
      }

      if (filename.includes('/packages/') && /^apps\//.test(source)) {
        report(
          node.source,
          '`packages/*` 내부에서 `apps/*`를 import할 수 없습니다.',
        );
      }

      const currentLayer = getCurrentLayer(filename);
      const sourceLayer = getSourceLayerFromImport(source);

      if (
        currentLayer &&
        sourceLayer &&
        LOCAL_LAYER_ORDER.includes(currentLayer) &&
        LOCAL_LAYER_ORDER.includes(sourceLayer) &&
        LOCAL_LAYER_ORDER.indexOf(sourceLayer) >
          LOCAL_LAYER_ORDER.indexOf(currentLayer)
      ) {
        report(
          node.source,
          '허용된 의존성 방향을 거슬러 import할 수 없습니다.',
        );
      }
    }

    function checkApiServiceFunction(node) {
      if (!isApiServiceFile(filename)) {
        return;
      }

      const functionName = getFunctionNameFromNode(node);

      if (!functionName || !functionName.startsWith('use')) {
        return;
      }

      const functionNode =
        node.type === 'VariableDeclarator' ? node.init : node;
      const optionsParam = functionNode.params.find(
        (param) => param.type === 'Identifier' && param.name === 'options',
      );

      if (!optionsParam) {
        return;
      }

      if (!getRecordStringAnyStatus(getIdentifierTypeNode(optionsParam))) {
        report(
          optionsParam,
          'service 훅의 options 매개변수 타입은 Record<string, any>여야 합니다.',
        );
      }
    }

    function checkUseQueryCall(node) {
      if (!isApiServiceFile(filename)) {
        return;
      }

      const optionsObject = getUseQueryOptionsObject(node);

      if (!optionsObject) {
        return;
      }

      const properties = optionsObject.properties;
      const optionsSpreadIndex = properties.findIndex(
        (property) =>
          property.type === 'SpreadElement' &&
          property.argument.type === 'Identifier' &&
          property.argument.name === 'options',
      );

      if (
        optionsSpreadIndex >= 0 &&
        optionsSpreadIndex !== properties.length - 1
      ) {
        report(
          properties[optionsSpreadIndex],
          'useQuery의 ...options는 캐시 설정 뒤, 객체의 마지막에 위치해야 합니다.',
        );
      }

      for (const property of properties) {
        if (property.type !== 'Property') {
          continue;
        }

        const keyName = getPropertyName(property.key);

        if (keyName === 'queryKey' && !isQueryKeyMember(property.value)) {
          report(
            property.value,
            'queryKey는 queryKey.* 상수를 사용해야 합니다.',
          );
        }

        if (
          (keyName === 'staleTime' || keyName === 'gcTime') &&
          !isCacheConfigMember(property.value, keyName) &&
          isLiteralMathExpression(property.value)
        ) {
          report(
            property.value,
            `${keyName}은 하드코딩하지 않고 cacheConfig를 사용해야 합니다.`,
          );
        }

        if (keyName === 'queryFn') {
          const hasSafeParse = containsNode(
            property.value,
            (innerNode) =>
              innerNode.type === 'MemberExpression' &&
              getPropertyName(innerNode.property) === 'safeParse',
          );
          const hasConsoleError = containsNode(
            property.value,
            (innerNode) =>
              innerNode.type === 'CallExpression' &&
              innerNode.callee.type === 'MemberExpression' &&
              innerNode.callee.object.type === 'Identifier' &&
              innerNode.callee.object.name === 'console' &&
              getPropertyName(innerNode.callee.property) === 'error',
          );

          if (!hasSafeParse || !hasConsoleError) {
            report(
              property.value,
              'useQuery queryFn에는 zod safeParse 실패 처리 패턴이 필요합니다.',
            );
          }
        }
      }
    }

    function checkUseParamsCall(node) {
      if (!isUseParamsCall(node)) {
        return;
      }

      const firstTypeParameter = getFirstTypeParameter(node);

      if (getTypeReferenceName(firstTypeParameter) !== 'Params') {
        report(
          node,
          'URL 라우트 params 조회에는 useParams<Params>() 형식을 사용해야 합니다.',
        );
      }
    }

    function checkFileNaming(programNode) {
      if (baseName === 'index' || filename.endsWith('.d.ts')) {
        return;
      }

      const extension = path.extname(filename);
      const isTsx = extension === '.tsx';
      const isTs = extension === '.ts';

      if (filename.includes('/hooks/')) {
        if (!USE_HOOK_FILE_PATTERN.test(baseName)) {
          report(
            programNode,
            'hook 파일명은 use + 기능명 camelCase 형식이어야 합니다.',
          );
        }

        if (isTsx && !hasJsx) {
          report(
            programNode,
            'JSX를 포함하지 않는 hook 파일은 .ts 확장자를 사용해야 합니다.',
          );
        }
      }

      if (
        isApiPath(filename) &&
        isTs &&
        baseName !== 'api-codegen' &&
        baseName !== 'instance'
      ) {
        if (!API_FILENAME_PATTERN.test(baseName)) {
          report(
            programNode,
            'API 파일명은 PascalCase 리소스명 + service/type/api/zod suffix 형식이어야 합니다.',
          );
        }
      }

      if (filename.includes('/store/') && baseName !== 'index') {
        if (!baseName.endsWith('Store')) {
          report(
            programNode,
            'store 파일명은 사용 위치 + Store 형식이어야 합니다.',
          );
        }

        if (isTsx && !hasJsx) {
          report(
            programNode,
            'JSX를 포함하지 않는 store 파일은 .ts 확장자를 사용해야 합니다.',
          );
        }
      }

      if (
        hasJsx &&
        (filename.includes('/components/') ||
          filename.includes('/layouts/') ||
          filename.includes('/pages/'))
      ) {
        if (!PASCAL_CASE_PATTERN.test(baseName)) {
          report(programNode, '컴포넌트 파일명은 PascalCase여야 합니다.');
        }

        if (filename.includes('/layouts/') && !baseName.endsWith('Layout')) {
          report(
            programNode,
            '레이아웃 파일명은 용도 + Layout 형식이어야 합니다.',
          );
        }
      }

      if (filename.includes('/context/') && baseName !== 'index') {
        if (!baseName.endsWith('Context')) {
          report(
            programNode,
            'context 파일명은 사용 위치 + Context 형식이어야 합니다.',
          );
        }
      }

      if (filename.includes('/provider/') && baseName !== 'index') {
        if (!baseName.endsWith('Provider')) {
          report(
            programNode,
            'provider 파일명은 사용 위치 + Provider 형식이어야 합니다.',
          );
        }
      }
    }

    function checkDefaultExports(programNode) {
      const defaultExport = programNode.body.find(
        (node) => node.type === 'ExportDefaultDeclaration',
      );

      const shouldBeComponent =
        hasJsx &&
        (filename.endsWith('.tsx') ||
          filename.includes('/components/') ||
          filename.includes('/layouts/') ||
          filename.includes('/pages/'));
      const shouldBeHook = filename.includes('/hooks/') && isHookName(baseName);

      if ((shouldBeComponent || shouldBeHook) && defaultExport) {
        if (!isDefaultExportFunction(defaultExport)) {
          report(
            defaultExport,
            'default export는 export default function 형태여야 합니다.',
          );
          return;
        }
      }

      if (shouldBeHook && defaultExport) {
        const functionName = getDefaultExportFunctionName(defaultExport);

        if (!functionName || !isHookName(functionName)) {
          report(
            defaultExport,
            '커스텀 훅 default export는 export default function use... 형태여야 합니다.',
          );
        }
      }

      if (
        shouldBeComponent &&
        defaultExport &&
        isDefaultExportFunction(defaultExport)
      ) {
        const functionName = getDefaultExportFunctionName(defaultExport);

        if (!isReactComponentName(functionName)) {
          return;
        }

        const functionNode = defaultExport.declaration;
        const propsParam = functionNode.params[0];

        if (propsParam) {
          if (propsParam.type !== 'Identifier') {
            report(
              propsParam,
              '컴포넌트 props는 props 파라미터로 받고 내부에서 구조 분해해야 합니다.',
            );
          } else {
            const propsTypeName = getTypeReferenceName(
              getIdentifierTypeNode(propsParam),
            );

            if (propsTypeName !== 'Props') {
              report(
                propsParam,
                'React 컴포넌트 props 타입명은 Props여야 합니다.',
              );
            }

            if (!hasPropsDestructuring(functionNode, propsParam.name)) {
              report(
                propsParam,
                '컴포넌트 props는 컴포넌트 내부에서 구조 분해해야 합니다.',
              );
            }
          }

          const propsDeclaration = findTopLevelDeclaration(
            programNode,
            'Props',
          );

          if (!propsDeclaration) {
            report(
              defaultExport,
              'React 컴포넌트 props 타입은 Props로 선언해야 합니다.',
            );
          } else {
            const propsDeclarationKind = getDeclarationKind(propsDeclaration);

            if (propsDeclarationKind !== 'TSInterfaceDeclaration') {
              report(
                propsDeclaration,
                'React 컴포넌트 Props는 interface로 선언해야 합니다.',
              );
            }

            const previousNode = getPreviousNonImportNode(
              programNode,
              defaultExport,
            );

            if (previousNode !== propsDeclaration) {
              report(
                propsDeclaration,
                'Props는 export default function 컴포넌트 선언 바로 위에 위치해야 합니다.',
              );
            }
          }
        }
      }
    }

    function checkParamsDeclaration(programNode) {
      const hasParamsUsage = containsNode(programNode, isUseParamsCall);

      if (!hasParamsUsage) {
        return;
      }

      const paramsDeclaration = findTopLevelDeclaration(programNode, 'Params');
      const defaultExport = programNode.body.find(
        (node) => node.type === 'ExportDefaultDeclaration',
      );

      if (!paramsDeclaration) {
        report(
          programNode,
          'URL 라우트 params 타입은 Params로 선언해야 합니다.',
        );
        return;
      }

      if (getDeclarationKind(paramsDeclaration) !== 'TSTypeAliasDeclaration') {
        report(
          paramsDeclaration,
          'URL 라우트 params는 type Params로 선언해야 합니다.',
        );
      }

      if (defaultExport) {
        const previousNode = getPreviousNonImportNode(
          programNode,
          defaultExport,
        );

        if (previousNode !== paramsDeclaration) {
          report(
            paramsDeclaration,
            'Params는 export default function 컴포넌트 선언 바로 위에 위치해야 합니다.',
          );
        }
      }
    }

    return {
      Program(programNode) {
        const comments = sourceCode.getAllComments();

        for (const comment of comments) {
          const text = comment.value.trim();
          const lineText = sourceCode.lines[comment.loc.start.line - 1] || '';
          const beforeComment = lineText.slice(0, comment.loc.start.column);

          if (/eslint-disable/.test(text) && !/--\s*\S+/.test(text)) {
            report(
              comment,
              'eslint-disable 주석에는 사유를 함께 작성해야 합니다.',
            );
          }

          if (
            /@ts-(?:ignore|expect-error)/.test(text) &&
            !/@ts-(?:ignore|expect-error)\s*[:가-힣A-Za-z0-9_-]/.test(text)
          ) {
            report(
              comment,
              '@ts-ignore/@ts-expect-error 주석에는 사유를 함께 작성해야 합니다.',
            );
          }

          if (beforeComment.trim()) {
            report(
              comment,
              '줄 끝 인라인 주석은 금지됩니다. 코드 위 별도 줄에 작성해야 합니다.',
            );
          }

          if (/\b(?:TODO|FIXME|XXX)\b/i.test(text) && !/TODO:/.test(text)) {
            report(comment, '미완성 작업은 TODO: 형식으로 작성해야 합니다.');
          }
        }
      },

      ImportDeclaration: checkImportDeclaration,

      VariableDeclaration: checkConstNaming,

      VariableDeclarator(node) {
        checkVariableDeclarator(node);
        checkApiServiceFunction(node);
      },

      FunctionDeclaration: checkApiServiceFunction,

      CallExpression(node) {
        if (isUseEffectCall(node) && node.arguments.length < 2) {
          report(node, 'useEffect 호출에는 의존성 배열 인자가 필요합니다.');
        }

        checkUseParamsCall(node);
        checkUseQueryCall(node);
      },

      TSNonNullExpression(node) {
        report(node, 'Non-null assertion은 사용하지 않아야 합니다.');
      },

      JSXElement() {
        hasJsx = true;
      },

      JSXFragment() {
        hasJsx = true;
      },

      JSXAttribute(node) {
        checkClassNameAttribute(node);
        checkEventHandlerAttribute(node);
      },

      'Program:exit'(programNode) {
        if (apiImportNodes.length > 1) {
          for (const node of apiImportNodes.slice(1)) {
            report(node, '`@/api` import는 한 파일에서 하나로 합쳐야 합니다.');
          }
        }

        checkFileNaming(programNode);
        checkDefaultExports(programNode);
        checkParamsDeclaration(programNode);
      },
    };
  },
};
