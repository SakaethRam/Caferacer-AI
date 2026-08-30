import { IngestedRepository, CodeNode, DependencyGraph } from '../types/index.js';

export interface ImpactAnalysisContext {
  seedNodes: CodeNode[];
  directlyAffectedIds: string[];
  downstreamAffectedIds: string[];
  impactPaths: Array<{
    source: string;
    target: string;
    path: string[];
    explanation: string;
  }>;
  snippets: Array<{
    nodeId: string;
    filePath: string;
    lines: string;
    content: string;
    reason: string;
  }>;
  graphContextSummary: string;
  isVagueChange: boolean;
}

const STOP_WORDS = new Set([
  'i', 'want', 'to', 'the', 'a', 'an', 'and', 'or', 'in', 'on', 'at', 'for', 'with', 'by', 'of',
  'this', 'that', 'make', 'add', 'remove', 'replace', 'change', 'modify', 'update', 'rename',
  'project', 'repository', 'codebase', 'better', 'system', 'handling', 'object',
]);

const DOMAIN_KEYWORDS: Record<string, string[]> = {
  auth: ['auth', 'authentication', 'login', 'logout', 'session', 'token', 'user', 'jwt', 'passport', 'permission', 'role'],
  payment: ['stripe', 'payment', 'billing', 'checkout', 'charge', 'invoice', 'card', 'subscription'],
  database: ['db', 'database', 'mongo', 'mongodb', 'postgres', 'postgresql', 'sql', 'orm', 'prisma', 'mongoose', 'query', 'store'],
  middleware: ['middleware', 'use', 'router', 'handler', 'interceptor', 'filter'],
  endpoint: ['route', 'router', 'api', 'endpoint', 'get', 'post', 'put', 'delete', 'patch'],
  request: ['request', 'req', 'body', 'params', 'query', 'header'],
  response: ['response', 'res', 'send', 'json', 'render', 'status'],
  express: ['express', 'application', 'app', 'server'],
  media: ['video', 'audio', 'player', 'autoplay', 'media'],
  state: ['redux', 'zustand', 'store', 'state', 'reducer', 'context'],
};

function extractKeywords(changeText: string): string[] {
  const words = changeText
    .toLowerCase()
    .replace(/[^a-z0-9_\-./]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2);

  const keywords = new Set<string>();

  for (const word of words) {
    if (!STOP_WORDS.has(word)) {
      keywords.add(word);
    }
    // Check domain expansion
    for (const [category, synonyms] of Object.entries(DOMAIN_KEYWORDS)) {
      if (synonyms.includes(word) || word === category) {
        synonyms.forEach((syn) => keywords.add(syn));
      }
    }
  }

  return Array.from(keywords);
}

function sanitizeSourceContent(content: string): string {
  return content
    .replace(/(api[_-]?key|secret|password|token|bearer)\s*[:=]\s*["']([^"']+)["']/gi, '$1: "[REDACTED]"')
    .replace(/([a-zA-Z0-9_-]{24,}\.[a-zA-Z0-9_-]{6,}\.[a-zA-Z0-9_-]{27,})/g, '[REDACTED_JWT]');
}

/**
 * Performs candidate seed selection, reverse graph traversal up to 3 hops,
 * and extracts bounded source code evidence.
 */
export function analyzeGraphImpact(
  repo: IngestedRepository,
  changeText: string,
  targetFilePaths?: string[]
): ImpactAnalysisContext {
  const graph = repo.graph;
  if (!graph) {
    return {
      seedNodes: [],
      directlyAffectedIds: [],
      downstreamAffectedIds: [],
      impactPaths: [],
      snippets: [],
      graphContextSummary: 'No graph available.',
      isVagueChange: true,
    };
  }

  const keywords = extractKeywords(changeText);
  const meaningfulWords = changeText
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));

  // Check for vague requests e.g. "make project better"
  const isVagueChange = meaningfulWords.length === 0 || (meaningfulWords.length === 1 && ['better', 'good', 'nice', 'clean', 'fix'].includes(meaningfulWords[0]));

  const scoredNodes: Array<{ node: CodeNode; score: number; matchReasons: string[] }> = [];

  for (const node of graph.nodes) {
    let score = 0;
    const matchReasons: string[] = [];

    // Check explicit target file paths
    if (targetFilePaths && targetFilePaths.includes(node.filePath)) {
      score += 100;
      matchReasons.push('Explicit user selected target file');
    }

    const lowerPath = node.filePath.toLowerCase();
    const lowerLabel = node.label.toLowerCase();

    for (const kw of keywords) {
      if (lowerLabel.includes(kw)) {
        score += 30;
        matchReasons.push(`File name matches "${kw}"`);
      } else if (lowerPath.includes(kw)) {
        score += 15;
        matchReasons.push(`File path matches "${kw}"`);
      }

      if (node.exports.some((e) => e.toLowerCase().includes(kw))) {
        score += 20;
        matchReasons.push(`Exports symbol matching "${kw}"`);
      }

      if (node.symbols?.some((s) => s.name.toLowerCase().includes(kw))) {
        score += 15;
        matchReasons.push(`Defines symbol matching "${kw}"`);
      }

      if (node.endpoints?.some((ep) => ep.path.toLowerCase().includes(kw))) {
        score += 25;
        matchReasons.push(`Handles endpoint route matching "${kw}"`);
      }
    }

    if (score > 0) {
      scoredNodes.push({ node, score, matchReasons });
    }
  }

  // Sort candidate seed nodes by score
  scoredNodes.sort((a, b) => b.score - a.score);

  // Take top seeds (up to 5)
  const seedNodes = isVagueChange ? [] : scoredNodes.slice(0, 5).map((s) => s.node);
  const directlyAffectedIds = seedNodes.map((n) => n.id);

  // Downstream Traversal (Reverse Adjacency List BFS up to 3 hops)
  const downstreamSet = new Set<string>();
  const impactPaths: ImpactAnalysisContext['impactPaths'] = [];
  const visitedPaths = new Map<string, string[]>();

  for (const seed of seedNodes) {
    const queue: Array<{ currId: string; depth: number; path: string[] }> = [
      { currId: seed.id, depth: 0, path: [seed.id] },
    ];
    visitedPaths.set(seed.id, [seed.id]);

    while (queue.length > 0) {
      const { currId, depth, path } = queue.shift()!;

      if (depth >= 3) continue;

      const dependents = graph.reverseAdjacency[currId] || [];
      for (const depId of dependents) {
        if (!directlyAffectedIds.includes(depId)) {
          downstreamSet.add(depId);
        }

        const newPath = [...path, depId];
        if (!visitedPaths.has(depId) || visitedPaths.get(depId)!.length > newPath.length) {
          visitedPaths.set(depId, newPath);
          queue.push({ currId: depId, depth: depth + 1, path: newPath });

          impactPaths.push({
            source: seed.id,
            target: depId,
            path: newPath,
            explanation: `Downstream dependency chain (${newPath.length - 1} hops from ${seed.label}): ${newPath.join(' → ')}`,
          });
        }
      }
    }
  }

  const downstreamAffectedIds = Array.from(downstreamSet).slice(0, 10);

  // Evidence Collection & Snippet Extraction
  const allImpactedIds = Array.from(new Set([...directlyAffectedIds, ...downstreamAffectedIds]));
  const snippets: ImpactAnalysisContext['snippets'] = [];

  for (const id of allImpactedIds) {
    const file = repo.files.get(id);
    if (file) {
      const sanitized = sanitizeSourceContent(file.content);
      const lines = sanitized.split('\n');
      const snippetContent =
        lines.length > 80
          ? lines.slice(0, 80).join('\n') + `\n... [Truncated ${lines.length - 80} lines]`
          : sanitized;

      const isSeed = directlyAffectedIds.includes(id);
      const reason = isSeed
        ? `Primary seed match for change terms`
        : `Downstream dependent via path: ${visitedPaths.get(id)?.join(' → ') || id}`;

      snippets.push({
        nodeId: id,
        filePath: file.path,
        lines: `1-${Math.min(lines.length, 80)}`,
        content: snippetContent,
        reason,
      });
    }
  }

  // Construct Subgraph Context Summary for Gemini
  const summaryLines: string[] = [];
  summaryLines.push(`Repository Name: ${repo.owner}/${repo.name}`);
  summaryLines.push(`Proposed Change: "${changeText}"`);
  summaryLines.push(`Is Vague / Unspecific Change: ${isVagueChange}`);
  summaryLines.push(`Directly Affected Seed Nodes (${seedNodes.length}): ${seedNodes.map((s) => s.filePath).join(', ') || 'None'}`);
  summaryLines.push(`Downstream Dependent Nodes (${downstreamAffectedIds.length}): ${downstreamAffectedIds.join(', ') || 'None'}`);
  summaryLines.push('\nDependency Chains (up to 3 Hops):');

  for (const pathObj of impactPaths.slice(0, 8)) {
    summaryLines.push(`- ${pathObj.explanation}`);
  }

  return {
    seedNodes,
    directlyAffectedIds,
    downstreamAffectedIds,
    impactPaths: impactPaths.slice(0, 10),
    snippets,
    graphContextSummary: summaryLines.join('\n'),
    isVagueChange,
  };
}
