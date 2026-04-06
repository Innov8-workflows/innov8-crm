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
  owner: string;
  stripe_customer_id: string;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: number;
  lead_id: number;
  stage: string;
  sort_order: number;
  domain: string;
  hosting_info: string;
  monthly_fee: number;
  renewal_date: string;
  login_details: string;
  project_notes: string;
  completed_at: string;
  client_status: string;
  stripe_price_id: string;
  created_at: string;
  updated_at: string;
  // Joined from leads
  business_name?: string;
  contact_name?: string;
  email?: string;
  phone?: string;
  business_type?: string;
  location?: string;
  capex?: number;
  demo_site_url?: string;
  // Enriched for completed projects
  cover_image?: string | null;
  tasks_total?: number;
  tasks_done?: number;
}

export interface ProjectTask {
  id: number;
  project_id: number;
  title: string;
  completed: number;
  sort_order: number;
  stage: string;
  created_at: string;
}

export interface ProjectFile {
  id: number;
  project_id: number;
  name: string;
  url: string;
  file_type: string;
  size: number;
  created_at: string;
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
  { value: "emailed", label: "Emailed", color: "#3B82F6" },
  { value: "messaged", label: "Messaged", color: "#8B5CF6" },
  { value: "called", label: "Called", color: "#F59E0B" },
  { value: "meeting_booked", label: "Meeting Booked", color: "#10B981" },
  { value: "won", label: "Won", color: "#059669" },
  { value: "lost", label: "Lost", color: "#EF4444" },
] as const;

export const PROJECT_STAGES = [
  { value: "onboarding", label: "Onboarding", color: "#6B7280" },
  { value: "design_content", label: "Design & Content", color: "#3B82F6" },
  { value: "build", label: "Build", color: "#eab308" },
  { value: "review", label: "Review", color: "#f97316" },
  { value: "launch", label: "Launch", color: "#22c55e" },
  { value: "completed", label: "Completed", color: "#059669" },
] as const;

export const ROW_COLORS: Record<string, string> = {
  new: "", emailed: "bg-blue-50/40", messaged: "bg-purple-50/40",
  called: "bg-amber-50/40", meeting_booked: "bg-green-50/40",
  won: "bg-emerald-50/50", lost: "bg-red-50/30",
};
