import { IngestedRepository, CodeNode, ContextRetrievalResult } from '../types/index.js';

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'with', 'by', 'about',
  'how', 'where', 'what', 'which', 'who', 'when', 'why', 'does', 'is', 'are', 'do', 'can',
  'should', 'would', 'could', 'this', 'that', 'project', 'repository', 'codebase', 'application',
]);

/**
 * Extracts technical search terms from natural language queries.
 */
function extractSearchTerms(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/[^a-z0-9_\-./]/g, ' ')
    .split(/\s+/)
    .filter((term) => term.length >= 2 && !STOP_WORDS.has(term));
}

/**
 * Sanitizes source text to prevent leaking credentials/secrets to external API.
 */
function sanitizeSourceContent(content: string): string {
  return content
    .replace(/(api[_-]?key|secret|password|token|bearer)\s*[:=]\s*["']([^"']+)["']/gi, '$1: "[REDACTED]"')
    .replace(/([a-zA-Z0-9_-]{24,}\.[a-zA-Z0-9_-]{6,}\.[a-zA-Z0-9_-]{27,})/g, '[REDACTED_JWT]');
}

/**
 * Deterministically ranks and retrieves graph context and source snippets for a query.
 */
export function retrieveContext(
  repo: IngestedRepository,
  query: string,
  focusNodeId?: string,
  maxNodes: number = 8
): ContextRetrievalResult {
  const graph = repo.graph;
  if (!graph) {
    return { relevantNodes: [], snippets: [], graphContextSummary: 'No graph available.' };
  }

  const terms = extractSearchTerms(query);
  const scoredNodes: Array<{ node: CodeNode; score: number; matchReasons: string[] }> = [];

  for (const node of graph.nodes) {
    let score = 0;
    const matchReasons: string[] = [];

    // Explicit node focus boost
    if (focusNodeId && node.id === focusNodeId) {
      score += 100;
      matchReasons.push('Explicitly focused in UI');
    }

    const lowerPath = node.filePath.toLowerCase();
    const lowerLabel = node.label.toLowerCase();

    for (const term of terms) {
      // Direct path / label matches
      if (lowerLabel.includes(term)) {
        score += 30;
        matchReasons.push(`File name matches "${term}"`);
      } else if (lowerPath.includes(term)) {
        score += 20;
        matchReasons.push(`Path matches "${term}"`);
      }

      // Symbol / Export matches
      if (node.exports.some((e) => e.toLowerCase().includes(term))) {
        score += 15;
        matchReasons.push(`Exports symbol matching "${term}"`);
      }

      if (node.symbols?.some((s) => s.name.toLowerCase().includes(term))) {
        score += 15;
        matchReasons.push(`Defines symbol matching "${term}"`);
      }

      // Endpoint path matches
      if (node.endpoints?.some((ep) => ep.path.toLowerCase().includes(term))) {
        score += 25;
        matchReasons.push(`Handles API route matching "${term}"`);
      }

      // DB reference matches
      if (term.includes('db') || term.includes('database') || term.includes('model') || term.includes('orm')) {
        if (node.type === 'db_model' || (node.dbReferences && node.dbReferences.length > 0)) {
          score += 15;
          matchReasons.push('Contains database model references');
        }
      }

      // Entrypoint heuristic
      if (term.includes('start') || term.includes('app') || term.includes('entry') || term.includes('main')) {
        if (lowerPath.includes('index') || lowerPath.includes('main') || lowerPath.includes('app') || lowerPath.includes('server')) {
          score += 20;
          matchReasons.push('App entrypoint match');
        }
      }
    }

    if (score > 0) {
      scoredNodes.push({ node, score, matchReasons });
    }
  }

  // Sort candidate nodes by score descending
  scoredNodes.sort((a, b) => b.score - a.score);

  // Take top seed nodes
  const seedNodes = scoredNodes.slice(0, maxNodes);
  const selectedNodeSet = new Map<string, CodeNode>();
  const nodeReasons = new Map<string, string>();

  for (const item of seedNodes) {
    selectedNodeSet.set(item.node.id, item.node);
    nodeReasons.set(item.node.id, item.matchReasons.join(', '));
  }

  // Subgraph 1-hop expansion for structural context
  for (const item of seedNodes) {
    const directDeps = graph.adjacencyList[item.node.id] || [];
    for (const depId of directDeps.slice(0, 2)) {
      if (!selectedNodeSet.has(depId) && selectedNodeSet.size < maxNodes + 4) {
        const depNode = graph.nodes.find((n) => n.id === depId);
        if (depNode) {
          selectedNodeSet.set(depNode.id, depNode);
          nodeReasons.set(depNode.id, `Direct dependency of ${item.node.label}`);
        }
      }
    }
  }

  // If query is broad (e.g. "architecture"), fallback to top entrypoints
  if (selectedNodeSet.size === 0) {
    const fallbacks = graph.nodes
      .filter((n) => n.filePath.includes('index') || n.filePath.includes('app') || n.filePath.includes('server') || n.type === 'endpoint')
      .slice(0, 5);
    
    for (const f of fallbacks) {
      selectedNodeSet.set(f.id, f);
      nodeReasons.set(f.id, 'Repository architecture entrypoint fallback');
    }
  }

  const selectedNodes = Array.from(selectedNodeSet.values());
  const snippets: ContextRetrievalResult['snippets'] = [];

  // Extract source code snippets capped at ~100 lines per file
  for (const node of selectedNodes) {
    const file = repo.files.get(node.filePath);
    if (file) {
      const sanitized = sanitizeSourceContent(file.content);
      const lines = sanitized.split('\n');
      const snippetContent = lines.length > 100 
        ? lines.slice(0, 100).join('\n') + `\n... [Truncated ${lines.length - 100} lines]` 
        : sanitized;

      snippets.push({
        nodeId: node.id,
        filePath: node.filePath,
        lines: `1-${Math.min(lines.length, 100)}`,
        content: snippetContent,
        score: scoredNodes.find((s) => s.node.id === node.id)?.score || 10,
        reason: nodeReasons.get(node.id) || 'Relevant context',
      });
    }
  }

  // Construct readable dependency graph summary for Gemini
  const summaryLines: string[] = [];
  summaryLines.push(`Repository Name: ${repo.owner}/${repo.name}`);
  summaryLines.push(`Total Files: ${graph.metadata.totalFiles}, Total Nodes: ${graph.metadata.totalNodes}, Total Edges: ${graph.metadata.totalEdges}`);
  summaryLines.push('\nRelevant Subgraph Dependencies:');

  for (const node of selectedNodes) {
    const deps = graph.adjacencyList[node.id] || [];
    const dependents = graph.reverseAdjacency[node.id] || [];
    summaryLines.push(`- File: ${node.filePath} [Type: ${node.type}, Exports: ${node.exports.join(', ') || 'none'}]`);
    if (deps.length > 0) summaryLines.push(`  Depends on: ${deps.join(', ')}`);
    if (dependents.length > 0) summaryLines.push(`  Depended on by: ${dependents.join(', ')}`);
  }

  return {
    relevantNodes: selectedNodes,
    snippets,
    graphContextSummary: summaryLines.join('\n'),
  };
}
