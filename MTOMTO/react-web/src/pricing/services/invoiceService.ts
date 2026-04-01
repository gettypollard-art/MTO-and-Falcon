// MTO Pricing — Invoice parsing service (Claude API)
// Fully implemented: upload → parse → extract JSON → insert items → suggest pricing

import type {
  InvoiceParsedItem,
  MtoInvoiceItem,
  ProductCategory,
  MarkupMultiplier,
} from '../types';
import { productCategories } from '../types';
import { computePretax, computeFinal } from '../utils';
import {
  createInvoice,
  updateInvoiceStatus,
  insertInvoiceItems,
  uploadInvoiceFile,
} from './supabaseService';

const ANTHROPIC_API_KEY = String(import.meta.env.VITE_ANTHROPIC_API_KEY ?? '').trim();

export function isInvoiceParserConfigured(): boolean {
  return Boolean(ANTHROPIC_API_KEY);
}

const PARSE_PROMPT = `You are an invoice parser for a cannabis dispensary. Extract line items from the invoice.
Return ONLY a JSON array of objects with these exact fields:
- product_name (string)
- category (one of: Flower, PreRolls, Edibles, Concentrates, Vapes, Topicals, Tinctures, CBD, Seeds, Paraphernalia)
- quantity (number)
- unit_cost (number, the cost per unit in dollars)
- total_cost (number, quantity × unit_cost)

If you cannot determine a field, use reasonable defaults:
- category defaults to "Flower"
- unit_cost defaults to 0
- total_cost = quantity × unit_cost

Return ONLY the JSON array, no other text.`;

function cleanJsonResponse(raw: string): string {
  let cleaned = raw.trim();
  // Strip markdown code fences
  if (cleaned.startsWith('```')) {
    const firstNewline = cleaned.indexOf('\n');
    cleaned = cleaned.slice(firstNewline + 1);
    const lastFence = cleaned.lastIndexOf('```');
    if (lastFence >= 0) cleaned = cleaned.slice(0, lastFence);
  }
  cleaned = cleaned.trim();
  return cleaned;
}

function validateCategory(value: string): ProductCategory {
  if (productCategories.includes(value as ProductCategory)) {
    return value as ProductCategory;
  }
  return 'Flower';
}

function parseItemsFromJson(raw: string): InvoiceParsedItem[] {
  const cleaned = cleanJsonResponse(raw);
  const parsed: unknown = JSON.parse(cleaned);
  if (!Array.isArray(parsed)) throw new Error('Expected JSON array from parser');
  return parsed.map((item: Record<string, unknown>) => ({
    product_name: String(item.product_name ?? ''),
    category: validateCategory(String(item.category ?? 'Flower')),
    quantity: Math.max(0, Number(item.quantity) || 0),
    unit_cost: Math.max(0, Number(item.unit_cost) || 0),
    total_cost: Math.max(0, Number(item.total_cost) || 0),
  }));
}

function suggestMarkup(category: ProductCategory): MarkupMultiplier {
  const categoryDefaults: Partial<Record<ProductCategory, MarkupMultiplier>> = {
    Flower: 2.0,
    PreRolls: 2.0,
    Edibles: 2.5,
    Concentrates: 2.0,
    Vapes: 2.0,
    Topicals: 2.5,
    Tinctures: 2.5,
    CBD: 2.0,
    Seeds: 3.0,
    Paraphernalia: 3.0,
  };
  return categoryDefaults[category] ?? 2.0;
}

export async function parseInvoiceWithClaude(
  fileContent: string,
): Promise<InvoiceParsedItem[]> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error('Anthropic API key not configured. Set VITE_ANTHROPIC_API_KEY in your .env file.');
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: `${PARSE_PROMPT}\n\nInvoice content:\n${fileContent}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Claude API error (${response.status}): ${errorText}`);
  }

  const body = await response.json() as { content: Array<{ type: string; text: string }> };
  const textBlock = body.content.find((b) => b.type === 'text');
  if (!textBlock) throw new Error('No text response from Claude API');

  return parseItemsFromJson(textBlock.text);
}

export async function processInvoiceUpload(
  file: File,
  storeId: string,
  vendorName: string,
): Promise<{ invoiceId: string; items: MtoInvoiceItem[] }> {
  // 1. Upload file to Supabase Storage
  let filePath = '';
  try {
    filePath = await uploadInvoiceFile(file, storeId);
  } catch {
    // Storage not configured — proceed without file storage
  }

  // 2. Create invoice record
  const invoice = await createInvoice({
    store_id: storeId,
    vendor_name: vendorName,
    file_path: filePath,
    status: 'parsing',
  });

  try {
    // 3. Read file content
    const fileText = await file.text();

    // 4. Parse with Claude
    const parsedItems = await parseInvoiceWithClaude(fileText);

    // 5. Build items with suggested pricing
    const itemRows = parsedItems.map((item) => {
      const markup = suggestMarkup(item.category);
      const pretax = computePretax(item.unit_cost, markup);
      const final_ = computeFinal(pretax);
      return {
        invoice_id: invoice.id,
        product_name: item.product_name,
        category: item.category,
        quantity: item.quantity,
        unit_cost: item.unit_cost,
        total_cost: item.total_cost,
        suggested_markup: markup,
        suggested_pretax: pretax,
        suggested_final: final_,
      };
    });

    // 6. Insert items
    const insertedItems = await insertInvoiceItems(itemRows);

    // 7. Update invoice status
    await updateInvoiceStatus(invoice.id, 'parsed', new Date().toISOString());

    return { invoiceId: invoice.id, items: insertedItems };
  } catch (err) {
    await updateInvoiceStatus(invoice.id, 'error');
    throw err;
  }
}
