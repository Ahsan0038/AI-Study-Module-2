export interface User {
  id: string;
  email: string;
  fullName: string;
  title?: string;
  profilePicture?: string;
  createdAt: string;
}

export type JobStatus = 'Applied' | 'Interview' | 'Offer' | 'Rejected';
export type JobType = 'Remote' | 'Hybrid' | 'On-site';

export interface JobApplication {
  id: string;
  userId: string;
  company: string;
  title: string;
  url?: string;
  date: string;
  status: JobStatus;
  notes?: string;
  salary?: string;
  location?: string;
  type?: JobType;
  createdAt: string;
}

export interface ResumeAnalysis {
  score: number;
  suggestions: string[];
  skills: {
    present: string[];
    missing: string[];
  };
  grammar: string[];
  atsScore: number;
  keywords: string[];
  summary: string;
}

export interface Resume {
  id: string;
  userId: string;
  fileName: string;
  uploadedAt: string;
  analysis: ResumeAnalysis;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
}
