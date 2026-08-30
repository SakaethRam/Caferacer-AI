import { parse } from '@babel/parser';
import traverseModule from '@babel/traverse';
import { ParsedFileAnalysis, ApiEndpointMetadata } from '../types/index.js';

const SUPPORTED_EXTENSIONS = new Set(['js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs']);

// Handle default vs namespace ES module import differences for @babel/traverse
const traverse = typeof traverseModule === 'function' 
  ? traverseModule 
  : (traverseModule as any).default || traverseModule;

/**
 * Parses JS/TS/JSX/TSX source file using Babel parser & visitor AST traversal.
 */
export function parseSourceFile(filePath: string, content: string, extension: string, lines: number): ParsedFileAnalysis {

  const ext = extension.toLowerCase();

  const analysis: ParsedFileAnalysis = {
    filePath,
    language: ext.includes('ts') ? 'TypeScript' : 'JavaScript',
    lines,
    rawImports: [],
    resolvedDependencies: [],
    unresolvedImports: [],
    exports: [],
    symbols: [],
    endpoints: [],
    dbReferences: [],
    isSupported: SUPPORTED_EXTENSIONS.has(ext),
  };

  if (!analysis.isSupported || !content.trim()) {
    return analysis;
  }

  try {
    const ast = parse(content, {
      sourceType: 'module',
      plugins: [
        'typescript',
        'jsx',
        'classProperties',
        'classPrivateProperties',
        'classPrivateMethods',
        'decorators-legacy',
        'dynamicImport',
        'exportDefaultFrom',
        'exportNamespaceFrom',
        'nullishCoalescingOperator',
        'optionalChaining',
        'objectRestSpread',
        'topLevelAwait',
      ],
      errorRecovery: true,
    });

    traverse(ast, {
      // 1. ES Import Declarations & Dynamic Imports
      ImportDeclaration(path: any) {
        const specifier = path.node.source.value;
        if (specifier && !analysis.rawImports.includes(specifier)) {
          analysis.rawImports.push(specifier);
        }
      },

      // 2. CommonJS require('...') & import('...')
      CallExpression(path: any) {
        const callee = path.node.callee;

        // CommonJS require
        if (callee.type === 'Identifier' && callee.name === 'require') {
          const arg = path.node.arguments[0];
          if (arg && arg.type === 'StringLiteral' && !analysis.rawImports.includes(arg.value)) {
            analysis.rawImports.push(arg.value);
          }
        }

        // Express / Fastify / API Route detection (e.g. app.get('/api/users'), router.post(...))
        if (callee.type === 'MemberExpression') {
          const property = callee.property;
          if (property.type === 'Identifier') {
            const methodName = property.name.toUpperCase();
            if (['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'ALL', 'USE'].includes(methodName)) {
              const arg0 = path.node.arguments[0];
              if (arg0 && arg0.type === 'StringLiteral') {
                analysis.endpoints.push({
                  method: methodName === 'USE' ? 'ALL' : (methodName as ApiEndpointMetadata['method']),
                  path: arg0.value,
                });
              }
            }
          }
        }
      },

      // 3. Exports (ExportNamedDeclaration, ExportDefaultDeclaration)
      ExportNamedDeclaration(path: any) {
        if (path.node.declaration) {
          const decl = path.node.declaration;
          if (decl.type === 'FunctionDeclaration' && decl.id) {
            analysis.exports.push(decl.id.name);
          } else if (decl.type === 'ClassDeclaration' && decl.id) {
            analysis.exports.push(decl.id.name);
          } else if (decl.type === 'VariableDeclaration') {
            for (const d of decl.declarations) {
              if (d.id.type === 'Identifier') {
                analysis.exports.push(d.id.name);
              }
            }
          } else if (decl.type === 'TSTypeAliasDeclaration' || decl.type === 'TSInterfaceDeclaration') {
            if (decl.id) analysis.exports.push(decl.id.name);
          }
        }
        if (path.node.specifiers) {
          for (const s of path.node.specifiers) {
            if (s.exported.type === 'Identifier') {
              analysis.exports.push(s.exported.name);
            }
          }
        }
      },

      ExportDefaultDeclaration() {
        if (!analysis.exports.includes('default')) {
          analysis.exports.push('default');
        }
      },

      // 4. Function Declarations & Arrow Functions
      FunctionDeclaration(path: any) {
        if (path.node.id) {
          const name = path.node.id.name;
          const isComponent = /^[A-Z]/.test(name);
          analysis.symbols.push({
            name,
            kind: isComponent ? 'component' : 'function',
            isExported: analysis.exports.includes(name),
            loc: path.node.loc ? { start: path.node.loc.start.line, end: path.node.loc.end.line } : undefined,
          });
        }
      },

      ClassDeclaration(path: any) {
        if (path.node.id) {
          const name = path.node.id.name;
          analysis.symbols.push({
            name,
            kind: 'class',
            isExported: analysis.exports.includes(name),
            loc: path.node.loc ? { start: path.node.loc.start.line, end: path.node.loc.end.line } : undefined,
          });
        }
      },

      TSInterfaceDeclaration(path: any) {
        if (path.node.id) {
          const name = path.node.id.name;
          analysis.symbols.push({
            name,
            kind: 'interface',
            isExported: analysis.exports.includes(name),
            loc: path.node.loc ? { start: path.node.loc.start.line, end: path.node.loc.end.line } : undefined,
          });
        }
      },

      TSTypeAliasDeclaration(path: any) {
        if (path.node.id) {
          const name = path.node.id.name;
          analysis.symbols.push({
            name,
            kind: 'type',
            isExported: analysis.exports.includes(name),
            loc: path.node.loc ? { start: path.node.loc.start.line, end: path.node.loc.end.line } : undefined,
          });
        }
      },
    });

    // 5. Database Client / ORM Reference Detection
    for (const imp of analysis.rawImports) {
      const lower = imp.toLowerCase();
      if (lower.includes('@prisma/client') || lower.includes('prisma')) {
        analysis.dbReferences.push({ orm: 'prisma' });
      } else if (lower.includes('mongoose')) {
        analysis.dbReferences.push({ orm: 'mongoose' });
      } else if (lower.includes('knex')) {
        analysis.dbReferences.push({ orm: 'knex' });
      } else if (lower.includes('typeorm')) {
        analysis.dbReferences.push({ orm: 'typeorm' });
      } else if (lower.includes('pg') || lower.includes('postgres')) {
        analysis.dbReferences.push({ orm: 'pg' });
      }
    }

  } catch (err) {
    analysis.parseError = (err as Error).message;
  }

  return analysis;
}


