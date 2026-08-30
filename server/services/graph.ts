import { SourceFile, ParsedFileAnalysis, CodeNode, CodeEdge, DependencyGraph, IngestedRepository } from '../types/index.js';
import { parseSourceFile } from './parser.js';

/**
 * Resolves a raw import specifier (e.g. "./auth", "../components/Header") 
 * relative to the importing file's directory within the repository file map.
 */
export function resolveImportPath(
  importerPath: string,
  specifier: string,
  existingFilePaths: Set<string>
): string | null {
  // Only resolve relative or explicit relative-like imports (e.g. starting with . or /)
  if (!specifier.startsWith('.')) {
    return null;
  }

  const importerParts = importerPath.split('/');
  importerParts.pop(); // Remove filename to get importer directory

  const specifierParts = specifier.split('/');
  const resolvedParts = [...importerParts];

  for (const part of specifierParts) {
    if (part === '.' || part === '') continue;
    if (part === '..') {
      if (resolvedParts.length > 0) {
        resolvedParts.pop();
      }
    } else {
      resolvedParts.push(part);
    }
  }

  const basePath = resolvedParts.join('/');

  // Candidates for extension matching
  const extensionsToTry = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
  const indexFilesToTry = ['/index.ts', '/index.tsx', '/index.js', '/index.jsx'];

  // 1. Try exact or direct extension append
  for (const ext of extensionsToTry) {
    const candidate = `${basePath}${ext}`;
    if (existingFilePaths.has(candidate)) {
      return candidate;
    }
  }

  // 2. Try index file inside directory
  for (const indexFile of indexFilesToTry) {
    const candidate = `${basePath}${indexFile}`;
    if (existingFilePaths.has(candidate)) {
      return candidate;
    }
  }

  return null;
}

/**
 * Classifies node type based on AST analysis metadata.
 */
function classifyNodeType(analysis: ParsedFileAnalysis): CodeNode['type'] {
  if (analysis.endpoints.length > 0) return 'endpoint';
  if (analysis.dbReferences.length > 0) return 'db_model';
  if (analysis.symbols.some((s) => s.kind === 'component')) return 'component';
  return 'utility';
}

/**
 * Builds the complete deterministic DependencyGraph for an ingested repository.
 */
export function buildDependencyGraph(repo: IngestedRepository): DependencyGraph {
  const startTime = Date.now();
  const filePaths = new Set(repo.files.keys());

  const parsedAnalyses: ParsedFileAnalysis[] = [];
  const parseErrors: Array<{ filePath: string; error: string }> = [];
  const supportedLanguages = new Set<string>();

  let parsedCount = 0;
  let failedCount = 0;
  let totalUnresolvedImports = 0;

  // 1. AST Parsing Step
  for (const [path, file] of repo.files.entries()) {
    const analysis = parseSourceFile(path, file.content, file.extension, file.lines);
    
    if (analysis.isSupported) {
      supportedLanguages.add(analysis.language);
      if (analysis.parseError) {
        failedCount++;
        parseErrors.push({ filePath: path, error: analysis.parseError });
      } else {
        parsedCount++;
      }
    }

    // 2. Resolve Import Specifiers
    for (const rawImport of analysis.rawImports) {
      const resolved = resolveImportPath(path, rawImport, filePaths);
      if (resolved) {
        if (!analysis.resolvedDependencies.includes(resolved)) {
          analysis.resolvedDependencies.push(resolved);
        }
      } else {
        analysis.unresolvedImports.push(rawImport);
        totalUnresolvedImports++;
      }
    }

    parsedAnalyses.push(analysis);
  }

  // 3. Construct Graph Nodes
  const nodes: CodeNode[] = [];
  const nodeMap = new Map<string, CodeNode>();

  for (const analysis of parsedAnalyses) {
    const fileName = analysis.filePath.split('/').pop() || analysis.filePath;
    
    const node: CodeNode = {
      id: analysis.filePath,
      label: fileName,
      type: classifyNodeType(analysis),
      filePath: analysis.filePath,
      exports: analysis.exports,
      imports: analysis.resolvedDependencies,
      unresolvedImports: analysis.unresolvedImports,
      symbols: analysis.symbols,
      endpoints: analysis.endpoints,
      dbReferences: analysis.dbReferences,
      loc: analysis.lines,
    };

    nodes.push(node);
    nodeMap.set(node.id, node);
  }

  // 4. Construct Edges, Adjacency List & Reverse Adjacency
  const edges: CodeEdge[] = [];
  const edgeSet = new Set<string>();
  const adjacencyList: Record<string, string[]> = {};
  const reverseAdjacency: Record<string, string[]> = {};

  // Initialize adjacency records for all nodes
  for (const node of nodes) {
    adjacencyList[node.id] = [];
    reverseAdjacency[node.id] = [];
  }

  for (const sourceNode of nodes) {
    for (const targetPath of sourceNode.imports) {
      if (nodeMap.has(targetPath)) {
        const edgeId = `${sourceNode.id}->${targetPath}`;
        
        if (!edgeSet.has(edgeId)) {
          edgeSet.add(edgeId);

          const edge: CodeEdge = {
            id: edgeId,
            source: sourceNode.id,
            target: targetPath,
            relation: 'imports',
          };
          edges.push(edge);

          // Forward Adjacency: source depends on target
          if (!adjacencyList[sourceNode.id].includes(targetPath)) {
            adjacencyList[sourceNode.id].push(targetPath);
          }

          // Reverse Adjacency: target is depended on by source (Downstream Impact)
          if (!reverseAdjacency[targetPath].includes(sourceNode.id)) {
            reverseAdjacency[targetPath].push(sourceNode.id);
          }
        }
      }
    }
  }

  const endTime = Date.now();

  const graph: DependencyGraph = {
    nodes,
    edges,
    adjacencyList,
    reverseAdjacency,
    metadata: {
      totalFiles: repo.files.size,
      parsedFiles: parsedCount,
      failedFiles: failedCount,
      skippedFiles: repo.stats.skippedFiles,
      totalNodes: nodes.length,
      totalEdges: edges.length,
      supportedLanguages: Array.from(supportedLanguages),
      unresolvedImportCount: totalUnresolvedImports,
      parseErrors,
      analysisDurationMs: endTime - startTime,
    },
  };

  return graph;
}
