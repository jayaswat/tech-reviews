const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const { requireAuth } = require('../auth');
const queries = require('../services/reviewQueries');

const router = express.Router();

const MODEL = 'claude-opus-5';
const MAX_TOOL_ITERATIONS = 6;

const TOOLS = [
  {
    name: 'search_reviews',
    description: 'Find individual customer reviews matching filters. Returns up to 30 at a time, most recent first. Use this when the user wants to see specific reviews, comments, or examples — not for counts or averages (use the stats tools for those).',
    input_schema: {
      type: 'object',
      properties: {
        startDate: { type: 'string', description: 'YYYY-MM-DD, inclusive' },
        endDate: { type: 'string', description: 'YYYY-MM-DD, inclusive' },
        tech: { type: 'string', description: 'Exact technician name' },
        vendorId: { type: 'string' },
        minRating: { type: 'integer', minimum: 1, maximum: 5 },
        maxRating: { type: 'integer', minimum: 1, maximum: 5 },
        q: { type: 'string', description: 'Free-text search across customer name, job ID, and comment text' },
        limit: { type: 'integer', minimum: 1, maximum: 30, description: 'Default 15' },
      },
    },
  },
  {
    name: 'get_summary_stats',
    description: 'Overall review count, average rating, and star-rating breakdown for a date range and/or technician/vendor.',
    input_schema: {
      type: 'object',
      properties: {
        startDate: { type: 'string' },
        endDate: { type: 'string' },
        tech: { type: 'string' },
        vendorId: { type: 'string' },
      },
    },
  },
  {
    name: 'get_stats_by_technician',
    description: 'Review count and average rating broken down per technician, sorted best to worst.',
    input_schema: {
      type: 'object',
      properties: { startDate: { type: 'string' }, endDate: { type: 'string' }, vendorId: { type: 'string' } },
    },
  },
  {
    name: 'get_stats_by_vendor',
    description: 'Review count and average rating broken down per vendor/branch, sorted best to worst.',
    input_schema: {
      type: 'object',
      properties: { startDate: { type: 'string' }, endDate: { type: 'string' }, tech: { type: 'string' } },
    },
  },
  {
    name: 'get_monthly_trend',
    description: 'Review count and average rating for each month of a given year.',
    input_schema: {
      type: 'object',
      properties: { year: { type: 'integer' }, tech: { type: 'string' }, vendorId: { type: 'string' } },
      required: ['year'],
    },
  },
  {
    name: 'get_yearly_trend',
    description: 'Review count and average rating for each year on file.',
    input_schema: {
      type: 'object',
      properties: { tech: { type: 'string' }, vendorId: { type: 'string' } },
    },
  },
  {
    name: 'list_technicians',
    description: 'List every technician name that has at least one review on file. Use this to check the exact spelling/casing of a name before filtering by it.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'list_vendors',
    description: 'List every vendor ID (and name) that has at least one review on file.',
    input_schema: { type: 'object', properties: {} },
  },
];

const TOOL_HANDLERS = {
  search_reviews: queries.searchReviews,
  get_summary_stats: queries.getSummaryStats,
  get_stats_by_technician: queries.getStatsByTechnician,
  get_stats_by_vendor: queries.getStatsByVendor,
  get_monthly_trend: queries.getMonthlyTrend,
  get_yearly_trend: queries.getYearlyTrend,
  list_technicians: queries.listTechnicians,
  list_vendors: queries.listVendors,
};

function systemPrompt() {
  const today = new Date().toISOString().slice(0, 10);
  return `You are the data assistant embedded in "Tech Reviews", an internal site where S.W.A.T. Plumbing LLC tracks customer reviews of its service technicians (ratings, comments, job details).

Today's date is ${today}. Resolve relative phrases like "this month", "last month", or "this year" against that date yourself before calling a tool.

Rules:
- Always call a tool to look up real data before stating any number, name, or fact. Never guess or estimate a statistic.
- If a tool returns no matching data, say so plainly rather than filling in a plausible-sounding answer.
- Technician and vendor names in the data are stored in a fixed, known set — call list_technicians or list_vendors first if you're not sure of the exact spelling.
- Keep answers concise and concrete: lead with the number/fact, then brief supporting detail. This is for busy staff, not a report.
- You only have read access to review data. You cannot upload, edit, or delete anything, and you have no access outside this dataset.`;
}

router.post('/', requireAuth, async (req, res) => {
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({
      error: 'AI chat isn\'t set up yet — an admin needs to add ANTHROPIC_API_KEY to server/.env and restart the server.',
    });
  }

  const { message, history } = req.body;
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'A message is required.' });
  }

  const client = new Anthropic();

  const messages = [];
  if (Array.isArray(history)) {
    for (const turn of history) {
      if ((turn.role === 'user' || turn.role === 'assistant') && typeof turn.content === 'string') {
        messages.push({ role: turn.role, content: turn.content });
      }
    }
  }
  messages.push({ role: 'user', content: message });

  try {
    let iterations = 0;
    let finalText = '';

    while (iterations < MAX_TOOL_ITERATIONS) {
      iterations++;

      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 2048,
        system: systemPrompt(),
        tools: TOOLS,
        messages,
      });

      if (response.stop_reason === 'pause_turn') {
        messages.push({ role: 'assistant', content: response.content });
        continue;
      }

      const toolUseBlocks = response.content.filter((b) => b.type === 'tool_use');

      if (toolUseBlocks.length === 0) {
        finalText = response.content
          .filter((b) => b.type === 'text')
          .map((b) => b.text)
          .join('\n')
          .trim();
        break;
      }

      messages.push({ role: 'assistant', content: response.content });

      const toolResults = toolUseBlocks.map((toolUse) => {
        const handler = TOOL_HANDLERS[toolUse.name];
        let content;
        try {
          const result = handler ? handler(toolUse.input || {}) : { error: `Unknown tool: ${toolUse.name}` };
          content = JSON.stringify(result);
        } catch (err) {
          content = JSON.stringify({ error: err.message });
        }
        return { type: 'tool_result', tool_use_id: toolUse.id, content };
      });

      messages.push({ role: 'user', content: toolResults });
    }

    if (!finalText) {
      finalText = "I wasn't able to finish looking that up — try rephrasing or narrowing your question.";
    }

    res.json({ reply: finalText });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      return res.status(503).json({ error: 'AI chat is misconfigured — the ANTHROPIC_API_KEY appears to be invalid.' });
    }
    if (err instanceof Anthropic.RateLimitError) {
      return res.status(503).json({ error: 'AI chat is rate-limited right now — try again in a moment.' });
    }
    if (err instanceof Anthropic.APIError) {
      return res.status(502).json({ error: `AI chat error: ${err.message}` });
    }
    throw err;
  }
});

module.exports = router;
