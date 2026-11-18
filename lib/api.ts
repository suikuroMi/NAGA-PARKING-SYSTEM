// lib/api.ts
import type { Category, Rate, RateConfig, Session, Slot, Transaction } from '../store/types';

export const api = {
  /** Issue a new ticket for an assigned parking slot */
  async issueTicket(category: Category): Promise<{
    success: boolean;
    session?: Session;
    spot_number?: string;
    ticket?: { ticket_id: string; qr_code: string };
    error?: string;
  }> {
    try {
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, vehicle_type: category }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        return { success: false, error: data.error || 'Failed to issue ticket' };
      }
      return {
        success: true,
        session: data.session,
        spot_number: data.spot_number,
        ticket: data.ticket,
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  /** Lookup ticket for exit terminal checkout */
  async lookupTicket(ticketId: string): Promise<{
    success: boolean;
    status: 'found' | 'paid' | 'invalid' | 'error';
    session?: any;
    quote?: any;
    error?: string;
  }> {
    try {
      const res = await fetch(`/api/checkout?ticket_id=${encodeURIComponent(ticketId)}`);
      const data = await res.json();
      if (!res.ok) {
        return {
          success: false,
          status: data.status || 'invalid',
          error: data.error || 'Ticket not found',
        };
      }
      return data;
    } catch (err: any) {
      return { success: false, status: 'error', error: err.message };
    }
  },

  /** Complete payment and release parking spot */
  async completeCheckout(params: {
    ticketId: string;
    sessionId?: number;
    amountPaid: number;
    paymentMethod?: 'Cash' | 'Digital';
    attendantName?: string;
  }): Promise<{
    success: boolean;
    transaction?: Transaction;
    change_amount?: string;
    error?: string;
  }> {
    try {
      const res = await fetch('/api/checkout', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticket_id: params.ticketId,
          session_id: params.sessionId,
          amount_paid: params.amountPaid,
          tender: params.amountPaid,
          payment_method: params.paymentMethod || 'Cash',
          attendant_name: params.attendantName || 'Maria Santos',
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        return { success: false, error: data.error || 'Payment failed' };
      }
      return {
        success: true,
        transaction: data.transaction,
        change_amount: data.change_amount,
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  /** Fetch live records, stats, and spots */
  async fetchRecords(): Promise<any> {
    try {
      const res = await fetch('/api/records');
      return await res.json();
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  /** Fetch all spots */
  async fetchSlots(): Promise<Slot[]> {
    try {
      const res = await fetch('/api/slots');
      const data = await res.json();
      return data.success ? data.slots : [];
    } catch {
      return [];
    }
  },

  /** Update a slot status */
  async updateSlot(id: string, patch: { status?: string; category?: string; reason?: string }) {
    try {
      const res = await fetch('/api/slots', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...patch }),
      });
      return await res.json();
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  /** Fetch rates */
  async fetchRates(): Promise<RateConfig | null> {
    try {
      const res = await fetch('/api/rates');
      const data = await res.json();
      return data.success ? data.rates : null;
    } catch {
      return null;
    }
  },

  /** Save rates */
  async saveRates(categories: Record<Category, Rate>, grace: number, version?: string) {
    try {
      const res = await fetch('/api/rates', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categories, grace, version }),
      });
      return await res.json();
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },
};
