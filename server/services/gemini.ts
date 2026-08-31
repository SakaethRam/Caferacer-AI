import 'dotenv/config';

import { GoogleGenAI, Type, Schema } from '@google/genai';
import { createClient } from '@supabase/supabase-js';
import {
  QAResponse,
  ImpactResponse,
  ContextRetrievalResult,
} from '../types/index.js';
import { ImpactAnalysisContext } from './impact.js';

// ============================================================
// SUPABASE CONFIGURATION
// ============================================================
//
// Supabase is used as the source of truth for Gemini
// configuration.
//
// Required environment variables:
//
// SUPABASE_URL
// SUPABASE_SERVICE_ROLE_KEY
//
// There is NO GEMINI_API_KEY or GEMINI_MODEL environment variable.
// ============================================================

// Lazy Supabase client initialization so the server can boot safely
let supabaseClient: ReturnType<typeof createClient> | null = null;

function getSupabaseClient() {
  if (supabaseClient) return supabaseClient;

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      'Supabase configuration is missing on the server. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.'
    );
  }

  supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return supabaseClient;
}

// ============================================================
// GEMINI CONFIGURATION
// ============================================================
//
// Gemini API key AND model are retrieved from Supabase.
//
// Supabase table:
//
// app_settings
//
// key                 value
// ---------------------------------------------
// gemini_api_key      AIzaSyXXXXXXXXXXXX
// gemini_model        gemini-2.0-flash
// ============================================================

interface GeminiConfig {
  apiKey: string;
  model: string;
}

let cachedGeminiConfig: GeminiConfig | null = null;

/**
 * Retrieves Gemini configuration from Supabase.
 *
 * The result is cached in server memory so Supabase is not
 * queried for every Gemini request.
 */
async function getGeminiConfig(): Promise<GeminiConfig> {
  // Use cached configuration if available
  if (cachedGeminiConfig) {
    return cachedGeminiConfig;
  }

  const { data, error } = await getSupabaseClient()
    .from('app_settings')
    .select('key, value')
    .in('key', [
      'gemini_api_key',
      'gemini_model',
    ]);

  if (error) {
    console.error(
      'Failed to retrieve Gemini configuration from Supabase:',
      error
    );

    throw new Error(
      'Unable to retrieve Gemini configuration from Supabase.'
    );
  }

  const settings = Object.fromEntries(
    ((data as Array<{ key: string; value: string }>) ?? []).map((item) => [
      item.key,
      item.value,
    ])
  );

  const apiKey =
    settings.gemini_api_key?.trim();

  const model =
    settings.gemini_model?.trim();

  if (!apiKey) {
    throw new Error(
      'Gemini API key is not configured in Supabase.'
    );
  }

  if (!model) {
    throw new Error(
      'Gemini model is not configured in Supabase.'
    );
  }

  cachedGeminiConfig = {
    apiKey,
    model,
  };

  return cachedGeminiConfig;
}

/**
 * Clears the cached Gemini configuration.
 *
 * Useful when the Gemini API key or model is changed
 * in Supabase while the server is still running.
 */
export function clearGeminiConfigCache(): void {
  cachedGeminiConfig = null;
}

// ============================================================
// IMPACT SYSTEM INSTRUCTION
// ============================================================

const IMPACT_SYSTEM_INSTRUCTION = `You are CafeRacer's change-impact reasoning engine.
The repository graph and source snippets supplied to you are the authoritative evidence.
Do not invent files, dependencies, APIs, functions, or behavior.
Distinguish structural repository facts from your AI interpretations.
If the evidence is unspecific or insufficient (e.g. vague change request like "make project better"), explicitly state that confidence is LOW and list caveats in uncertainties.`;

// ============================================================
// QA SYSTEM INSTRUCTION
// ============================================================

const SYSTEM_INSTRUCTION = `You are CafeRacer's codebase reasoning engine.
Your task is to answer natural language questions about an ingested codebase using ONLY the provided AST dependency graph summary and source code snippets.

Rules:
1. Ground every claim directly in the provided evidence.
2. Distinguish REPOSITORY FACTS (directly visible code imports/routes/functions) from AI INFERENCES.
3. Do NOT invent or assume non-existent files, functions, dependencies, endpoints, or behavior.
4. If the provided context is insufficient to answer completely, explicitly state what is missing in the uncertainties array.
5. Provide concise, high-value developer answers with key points and evidence citations.`;

// ============================================================
// IMPACT RESPONSE SCHEMA
// ============================================================

const impactResponseSchema: Schema = {
  type: Type.OBJECT,

  properties: {
    riskLevel: {
      type: Type.STRING,
      enum: [
        'LOW',
        'MEDIUM',
        'HIGH',
        'CRITICAL',
      ],
      description:
        'Overall risk level based on centrality, public APIs, and downstream dependency depth.',
    },

    summary: {
      type: Type.STRING,
      description:
        'Executive technical summary explaining the blast radius and architectural consequences.',
    },

    componentAnalysis: {
      type: Type.ARRAY,

      items: {
        type: Type.OBJECT,

        properties: {
          nodeId: {
            type: Type.STRING,
          },

          whyAffected: {
            type: Type.STRING,
          },

          riskReason: {
            type: Type.STRING,
          },

          confidence: {
            type: Type.STRING,
            enum: [
              'HIGH',
              'MEDIUM',
              'LOW',
            ],
          },
        },

        required: [
          'nodeId',
          'whyAffected',
          'riskReason',
          'confidence',
        ],
      },
    },

    uncertainties: {
      type: Type.ARRAY,

      items: {
        type: Type.STRING,
      },
    },

    evidence: {
      type: Type.ARRAY,

      items: {
        type: Type.OBJECT,

        properties: {
          nodeId: {
            type: Type.STRING,
          },

          filePath: {
            type: Type.STRING,
          },

          codeSnippet: {
            type: Type.STRING,
          },

          lines: {
            type: Type.STRING,
          },

          isRepositoryFact: {
            type: Type.BOOLEAN,
          },
        },

        required: [
          'nodeId',
          'filePath',
          'codeSnippet',
          'lines',
          'isRepositoryFact',
        ],
      },
    },
  },

  required: [
    'riskLevel',
    'summary',
    'componentAnalysis',
    'evidence',
  ],
};

// ============================================================
// QA RESPONSE SCHEMA
// ============================================================

const qaResponseSchema: Schema = {
  type: Type.OBJECT,

  properties: {
    answer: {
      type: Type.STRING,
      description:
        'Clear, technical synthesis answering the user question.',
    },

    confidence: {
      type: Type.STRING,
      enum: [
        'HIGH',
        'MEDIUM',
        'LOW',
      ],
      description:
        'Confidence level based on retrieved evidence quality.',
    },

    keyPoints: {
      type: Type.ARRAY,

      items: {
        type: Type.STRING,
      },

      description:
        'Bullet points summarizing key takeaways.',
    },

    uncertainties: {
      type: Type.ARRAY,

      items: {
        type: Type.STRING,
      },

      description:
        'Any caveats or information missing from the provided context.',
    },

    evidence: {
      type: Type.ARRAY,

      items: {
        type: Type.OBJECT,

        properties: {
          nodeId: {
            type: Type.STRING,
            description:
              'File path ID of the evidence file',
          },

          filePath: {
            type: Type.STRING,
            description:
              'Relative file path',
          },

          lines: {
            type: Type.STRING,
            description:
              'Line range e.g. 1-45',
          },

          snippet: {
            type: Type.STRING,
            description:
              'Relevant code snippet excerpt',
          },

          explanation: {
            type: Type.STRING,
            description:
              'Why this snippet supports the answer',
          },

          isRepositoryFact: {
            type: Type.BOOLEAN,
            description:
              'True for direct code facts, false for AI inferences',
          },
        },

        required: [
          'nodeId',
          'filePath',
          'lines',
          'snippet',
          'explanation',
          'isRepositoryFact',
        ],
      },
    },
  },

  required: [
    'answer',
    'confidence',
    'keyPoints',
    'evidence',
  ],
};

// ============================================================
// GEMINI JSON HELPER
// ============================================================
//
// This is the ONLY function that directly talks to Gemini.
//
// It gets BOTH:
//
// 1. API key
// 2. Model name
//
// from Supabase.
// ============================================================

async function callGeminiJson(
  systemInstruction: string,
  userPrompt: string,
  schema: Schema
): Promise<string> {
  // Get API key and model from Supabase
  const {
    apiKey,
    model,
  } = await getGeminiConfig();

  // Create Gemini client using the Supabase API key
  const ai = new GoogleGenAI({
    apiKey,
  });

  // Call Gemini using the Supabase model configuration
  const response =
    await ai.models.generateContent({
      model,
      contents: userPrompt,

      config: {
        systemInstruction,

        responseMimeType:
          'application/json',

        responseSchema:
          schema,

        temperature: 0.2,
      },
    });

  const text = response.text;

  if (!text) {
    throw new Error(
      'Gemini returned empty response text'
    );
  }

  return text;
}

// ============================================================
// GENERATE IMPACT RESPONSE
// ============================================================

export async function generateImpactResponse(
  proposedChange: string,
  impactCtx: ImpactAnalysisContext
): Promise<ImpactResponse> {
  const promptLines: string[] = [];

  promptLines.push(
    `PROPOSED CHANGE: "${proposedChange}"`
  );

  promptLines.push(
    '\n=== STRUCTURAL GRAPH SUBGRAPH CONTEXT ==='
  );

  promptLines.push(
    impactCtx.graphContextSummary
  );

  promptLines.push(
    '\n=== SOURCE CODE EVIDENCE SNIPPETS ==='
  );

  for (const snip of impactCtx.snippets) {
    promptLines.push(
      `\n--- FILE: ${snip.filePath} (Lines ${snip.lines}) ---`
    );

    promptLines.push(
      `[Selection Reason: ${snip.reason}]`
    );

    promptLines.push(
      snip.content
    );
  }

  try {
    const jsonText =
      await callGeminiJson(
        IMPACT_SYSTEM_INSTRUCTION,
        promptLines.join('\n'),
        impactResponseSchema
      );

    const parsed =
      JSON.parse(jsonText);

    return {
      proposedChange,

      riskLevel:
        parsed.riskLevel ||
        (
          impactCtx.isVagueChange
            ? 'LOW'
            : 'MEDIUM'
        ),

      summary:
        parsed.summary,

      directlyAffectedNodeIds:
        impactCtx.directlyAffectedIds,

      downstreamAffectedNodeIds:
        impactCtx.downstreamAffectedIds,

      impactPaths:
        impactCtx.impactPaths.map(
          (p) => ({
            source: p.source,
            path: p.path,
            explanation:
              p.explanation,
          })
        ),

      componentAnalysis:
        parsed.componentAnalysis ||
        [],

      evidence:
        (parsed.evidence || []).map(
          (e: any) => ({
            nodeId: e.nodeId,
            filePath: e.filePath,
            codeSnippet:
              e.codeSnippet,
            lines: e.lines,
            isRepositoryFact:
              Boolean(
                e.isRepositoryFact
              ),
          })
        ),

      uncertainties:
        parsed.uncertainties ||
        [],
    };
  } catch (err) {
    console.error(
      'Gemini Impact Generation Error:',
      err
    );

    return {
      proposedChange,

      riskLevel:
        impactCtx.isVagueChange
          ? 'LOW'
          : 'MEDIUM',

      summary:
        `[Fallback AST Impact Analysis] Direct Graph Seed Nodes: ${
          impactCtx.directlyAffectedIds.join(
            ', '
          ) || 'None'
        }. Downstream dependents: ${
          impactCtx.downstreamAffectedIds.join(
            ', '
          ) || 'None'
        }.`,

      directlyAffectedNodeIds:
        impactCtx.directlyAffectedIds,

      downstreamAffectedNodeIds:
        impactCtx.downstreamAffectedIds,

      impactPaths:
        impactCtx.impactPaths.map(
          (p) => ({
            source: p.source,
            path: p.path,
            explanation:
              p.explanation,
          })
        ),

      componentAnalysis:
        impactCtx.seedNodes.map(
          (n) => ({
            nodeId: n.id,

            whyAffected:
              'Candidate match based on AST keywords',

            riskReason:
              'Direct change target',

            confidence:
              'LOW',
          })
        ),

      evidence:
        impactCtx.snippets.map(
          (s) => ({
            nodeId: s.nodeId,
            filePath: s.filePath,

            codeSnippet:
              s.content
                .split('\n')
                .slice(0, 4)
                .join('\n'),

            lines: s.lines,

            isRepositoryFact:
              true,
          })
        ),

      uncertainties: [
        `Gemini API error: ${
          (err as Error).message
        }`,
      ],
    };
  }
}

// ============================================================
// GENERATE QA RESPONSE
// ============================================================

export async function generateQAResponse(
  question: string,
  context: ContextRetrievalResult
): Promise<QAResponse> {
  const userPromptLines: string[] = [];

  userPromptLines.push(
    `USER QUESTION: "${question}"`
  );

  userPromptLines.push(
    '\n=== CODEBASE GRAPH SUMMARY ==='
  );

  userPromptLines.push(
    context.graphContextSummary
  );

  userPromptLines.push(
    '\n=== SOURCE CODE EVIDENCE SNIPPETS ==='
  );

  for (const snip of context.snippets) {
    userPromptLines.push(
      `\n--- FILE: ${snip.filePath} (Lines ${snip.lines}) ---`
    );

    userPromptLines.push(
      `[Retrieval Reason: ${snip.reason}]`
    );

    userPromptLines.push(
      snip.content
    );
  }

  try {
    const jsonText =
      await callGeminiJson(
        SYSTEM_INSTRUCTION,
        userPromptLines.join('\n'),
        qaResponseSchema
      );

    const parsedData =
      JSON.parse(
        jsonText
      ) as QAResponse;

    return {
      question,

      answer:
        parsedData.answer,

      confidence:
        parsedData.confidence ||
        'MEDIUM',

      keyPoints:
        parsedData.keyPoints ||
        [],

      uncertainties:
        parsedData.uncertainties ||
        [],

      evidence:
        (parsedData.evidence || [])
          .map(
            (e) => ({
              ...e,

              isRepositoryFact:
                Boolean(
                  e.isRepositoryFact
                ),
            })
          ),
    };
  } catch (err) {
    console.error(
      'Gemini Q&A Generation Error:',
      err
    );

    return {
      question,

      answer:
        `Analysis based on AST graph context (${context.relevantNodes.length} files matched):\n\n${context.snippets
          .map(
            (s) =>
              `- ${s.filePath}: ${s.reason}`
          )
          .join('\n')}`,

      confidence:
        'LOW',

      keyPoints: [
        'AST Graph matching succeeded.',
        'Gemini API call encountered an error.',
      ],

      uncertainties: [
        `Gemini API error: ${
          (err as Error).message
        }`,
      ],

      evidence:
        context.snippets.map(
          (s) => ({
            nodeId: s.nodeId,

            filePath:
              s.filePath,

            lines:
              s.lines,

            snippet:
              s.content
                .split('\n')
                .slice(0, 4)
                .join('\n'),

            explanation:
              s.reason,

            isRepositoryFact:
              true,
          })
        ),
    };
  }
}
