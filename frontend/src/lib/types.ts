export type Role = "student" | "professor";
export type RatingLabel = "STRONG" | "OKAY" | "WEAK";

export interface User { id: number; display_name: string; role: Role; is_demo: boolean }

export interface Question {
  id?: number; section: "code" | "report"; text: string; short_name: string; category: string; weight: number; position?: number;
}
export interface Rubric { id: number; name: string; module_id: number | null; is_template: boolean; source: string; is_demo: boolean; questions: Question[] }

export interface Rating {
  id: number; question_id: number | null; criterion_name: string; criterion_text: string; category: string;
  section: string; weight: number; rating: RatingLabel; score: number; contribution: number; evidence_quote: string;
  quote_status: "verified" | "near" | "unverified" | "none"; explanation: string; missing: string;
  issue_type: "missing" | "incorrect" | "unsupported" | "good" | "ambiguous"; coaching_question: string;
  flagged: boolean; flag_reasons: string[]; improvement_area_id: number | null; improvement_status: string | null;
}

export interface Quality {
  overall: number; is_demonstration: boolean; scores: Record<string, number>; weights: Record<string, number>;
  labels: Record<string, string>; explanations: Record<string, string>; disclaimer: string; method: string; caps: string[];
  per_criterion: { criterion: string; quote_status: string; aligned: boolean; reasoning_checks_passed: string; relevance_checks_passed: string }[];
}

export interface Assessment {
  id: number; mode: "live" | "simulated"; model_name: string; weighted_score: number; overall_summary: string;
  needs_human_review: boolean; shared_with_lecturer: boolean; is_demo: boolean; created_at: string; disclaimer: string;
  pipeline_log: { step: string; status: string; detail: string; ms: number }[];
  assignment: { id: number; title: string; module_name: string; number: number; module_id: number | null; is_demo: boolean };
  draft: { id: number; round_number: number; word_count: number; source: string; filename: string | null; text: string | null };
  previous_assessment_id: number | null; ratings: Rating[]; quality: Quality | null;
  lecturer_review: { items: { rating_id: number; rating: number; comment: string }[]; created_at: string } | null;
}

export interface ComparisonRow {
  criterion: string; to_criterion: string; category: string; from_score: number; to_score: number; delta: number;
  from_rating: RatingLabel; to_rating: RatingLabel; basis: string; note: string; status: string; message: string;
}
export interface Comparison {
  kind: "draft" | "assignment"; same_rubric: boolean; weighted_delta: number | null; note: string | null; modes_differ: boolean;
  from: { assessment_id: number; title: string; number: number; round: number; weighted_score: number; mode: string };
  to: { assessment_id: number; title: string; number: number; round: number; weighted_score: number; mode: string };
  rows: ComparisonRow[]; unmatched_from: { criterion: string; score: number; reason: string }[];
  unmatched_to: { criterion: string; score: number; reason: string }[]; improved: string[]; still_needs_attention: string[];
}

export interface AssignmentSummary {
  id: number; title: string; module_name: string; module_id: number | null; number: number; description: string | null;
  rubric_id: number; rubric_name: string; published: boolean; is_demo: boolean; latest_score: number | null;
  drafts: { id: number; round_number: number; word_count: number; source: string; created_at: string; assessment_id: number | null }[];
  assessments: { id: number; weighted_score: number; round: number; mode: string; created_at: string }[];
  rubric?: Rubric;
}

export interface ImprovementArea {
  id: number; criterion_name: string; category: string; status: "open" | "in_progress" | "completed"; student_plan: string;
  assessment_id: number; assignment_title: string; assignment_id: number; round: number; is_demo: boolean;
  rating: RatingLabel | null; score: number | null; coaching_question: string; missing: string; created_at: string;
}

export interface AppConfig { ai_mode: "live" | "simulated"; model: string; max_questions_per_section: number; min_cohort_size: number; retention_days: number; max_upload_mb: number }
