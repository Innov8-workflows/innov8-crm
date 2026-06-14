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
  lat?: number | null;
  lng?: number | null;
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
  invoice_status: string;
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
  last_seo_date?: string;
  // Enriched on list responses
  cover_image?: string | null;
  has_cover?: boolean;
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

export interface Solution {
  id: number;
  name: string;
  description: string;
  category: string;
  target_trades: string;
  upfront_price: number;
  monthly_price: number;
  install_days: number;
  pitch_angle: string;
  active: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface EntitySolution {
  id: number;
  entity_type: "lead" | "project";
  entity_id: number;
  solution_id: number;
  status: "proposed" | "sold" | "delivered" | "declined";
  upfront_charged: number;
  monthly_upcharge: number;
  notes: string;
  proposed_at: string;
  sold_at: string;
  delivered_at: string;
  created_at: string;
  updated_at: string;
  // Joined fields
  solution_name?: string;
  business_name?: string;
  category?: string;
}

export const SOLUTION_STATUSES = [
  { value: "proposed", label: "Proposed", color: "#f59e0b", icon: "light-bulb" },
  { value: "sold", label: "Sold", color: "#22c55e", icon: "currency-pound" },
  { value: "delivered", label: "Delivered", color: "#059669", icon: "check" },
  { value: "declined", label: "Declined", color: "#9CA3AF", icon: "x-mark" },
] as const;

export const SOLUTION_CATEGORIES = [
  { value: "website", label: "Website", color: "#22c55e" },
  { value: "ai", label: "AI", color: "#8b5cf6" },
  { value: "automation", label: "Automation", color: "#3b82f6" },
  { value: "marketing", label: "Marketing", color: "#ec4899" },
  { value: "integration", label: "Integration", color: "#10b981" },
  { value: "custom", label: "Custom Build", color: "#ea580c" },
] as const;

export const PIPELINE_STAGES = [
  { value: "new", label: "New", color: "#6B7280" },
  { value: "emailed", label: "Emailed", color: "#3B82F6" },
  { value: "messaged", label: "Messaged", color: "#8B5CF6" },
  { value: "to_call", label: "To Call", color: "#06B6D4" },
  { value: "called", label: "Called", color: "#F59E0B" },
  { value: "meeting_booked", label: "Meeting Booked", color: "#10B981" },
  { value: "verbal", label: "Verbal", color: "#16a34a" },
  { value: "won", label: "Won", color: "#059669" },
  { value: "maybe", label: "Maybe", color: "#ea580c" },
  { value: "lost", label: "Lost", color: "#EF4444" },
  { value: "rejected", label: "Rejected", color: "#9CA3AF" },
  { value: "dead", label: "Dead", color: "#4B5563" },
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

export interface Todo {
  id: number;
  text: string;
  detail: string;
  priority: "low" | "medium" | "high";
  done: number;
  owner: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
  completed_at: string;
}

// Ordered High → Medium → Low — array index doubles as the sort weight.
export const TODO_PRIORITIES = [
  { value: "high", label: "High", color: "#ef4444" },
  { value: "medium", label: "Medium", color: "#f59e0b" },
  { value: "low", label: "Low", color: "#64748b" },
] as const;
