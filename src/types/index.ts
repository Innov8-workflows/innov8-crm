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
  sort_order: number;
  status: string;
  follow_up_date: string;
  demo_site_url: string;
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

export interface Activity {
  id: number;
  lead_id: number;
  type: string;
  description: string;
  created_at: string;
}

export interface LeadNote {
  id: number;
  lead_id: number;
  content: string;
  created_at: string;
}

export type LeadUpdate = Partial<Omit<Lead, "id" | "created_at" | "updated_at">>;

export const PIPELINE_STAGES = [
  { value: "new", label: "New", color: "#6B7280" },
  { value: "contacted", label: "Contacted", color: "#3B82F6" },
  { value: "demo_sent", label: "Demo Sent", color: "#8B5CF6" },
  { value: "interested", label: "Interested", color: "#F59E0B" },
  { value: "meeting_booked", label: "Meeting Booked", color: "#10B981" },
  { value: "won", label: "Won", color: "#059669" },
  { value: "lost", label: "Lost", color: "#EF4444" },
] as const;

export const ROW_COLORS: Record<string, string> = {
  new: "",
  contacted: "bg-blue-50/40",
  demo_sent: "bg-purple-50/40",
  interested: "bg-amber-50/40",
  meeting_booked: "bg-green-50/40",
  won: "bg-emerald-50/50",
  lost: "bg-red-50/30",
};
