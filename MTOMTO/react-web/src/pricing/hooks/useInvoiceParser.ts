// MTO Pricing — useInvoiceParser hook

import { useState, useCallback } from 'react';
import type { MtoInvoiceItem } from '../types';
import { isInvoiceParserConfigured, processInvoiceUpload } from '../services/invoiceService';

interface InvoiceParserState {
  items: MtoInvoiceItem[];
  invoiceId: string | null;
  loading: boolean;
  error: string | null;
  configured: boolean;
}

export function useInvoiceParser() {
  const [state, setState] = useState<InvoiceParserState>({
    items: [],
    invoiceId: null,
    loading: false,
    error: null,
    configured: isInvoiceParserConfigured(),
  });

  const parseInvoice = useCallback(
    async (file: File, storeId: string, vendorName: string) => {
      if (!isInvoiceParserConfigured()) {
        setState((s) => ({
          ...s,
          error: 'Invoice parser not configured. Set VITE_ANTHROPIC_API_KEY in your .env file.',
        }));
        return;
      }
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const result = await processInvoiceUpload(file, storeId, vendorName);
        setState({
          items: result.items,
          invoiceId: result.invoiceId,
          loading: false,
          error: null,
          configured: true,
        });
      } catch (err) {
        setState((s) => ({
          ...s,
          loading: false,
          error: err instanceof Error ? err.message : 'Failed to parse invoice',
        }));
      }
    },
    [],
  );

  const reset = useCallback(() => {
    setState({
      items: [],
      invoiceId: null,
      loading: false,
      error: null,
      configured: isInvoiceParserConfigured(),
    });
  }, []);

  return {
    data: state.items,
    invoiceId: state.invoiceId,
    loading: state.loading,
    error: state.error,
    configured: state.configured,
    parseInvoice,
    reset,
  };
}
