export interface Lead {
  id: number;
  business_name: string;
  contact_name: string;
  email: string;
  phone: string;
  business_type: string;
  location: string;
  website_status: number;
  emailed: number;
  messaged: number;
  responded: number;
  followed_up: number;
  capex: number | null;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface EmailLog {
  id: number;
  lead_id: number | null;
  recipient: string;
  subject: string;
  sent_at: string;
  gmail_msg_id: string;
  matched: number;
  created_at: string;
}

export type LeadUpdate = Partial<Omit<Lead, "id" | "created_at" | "updated_at">>;
