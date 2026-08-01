import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import { User, JobApplication, Resume } from '../src/types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../data');
const USERS_FILE = path.resolve(DATA_DIR, 'users.json');
const JOBS_FILE = path.resolve(DATA_DIR, 'jobs.json');
const RESUMES_FILE = path.resolve(DATA_DIR, 'resumes.json');

// Ensure directories exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initializers
function initFile(filePath: string, defaultData: any) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2), 'utf-8');
  }
}

initFile(USERS_FILE, []);
initFile(JOBS_FILE, []);
initFile(RESUMES_FILE, []);

export class DB {
  // --- USERS ---
  static getUsers(): any[] {
    try {
      return JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
    } catch {
      return [];
    }
  }

  static saveUsers(users: any[]) {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf-8');
  }

  static getUserByEmail(email: string) {
    const users = this.getUsers();
    return users.find(u => u.email.toLowerCase() === email.toLowerCase());
  }

  static getUserById(id: string): User | undefined {
    const users = this.getUsers();
    const user = users.find(u => u.id === id);
    if (!user) return undefined;
    const { passwordHash, ...safeUser } = user;
    return safeUser;
  }

  static async createUser(email: string, passwordPlain: string, fullName: string): Promise<User> {
    const users = this.getUsers();
    if (users.some(u => u.email.toLowerCase() === email.toLowerCase())) {
      throw new Error('User with this email already exists.');
    }

    const passwordHash = await bcrypt.hash(passwordPlain, 10);
    const newUser = {
      id: 'usr_' + Math.random().toString(36).substr(2, 9),
      email: email.toLowerCase(),
      fullName,
      passwordHash,
      createdAt: new Date().toISOString()
    };

    users.push(newUser);
    this.saveUsers(users);

    const { passwordHash: _, ...safeUser } = newUser;
    return safeUser;
  }

  static updateUserProfile(id: string, updates: { fullName?: string; title?: string; profilePicture?: string }) {
    const users = this.getUsers();
    const index = users.findIndex(u => u.id === id);
    if (index === -1) throw new Error('User not found');

    users[index] = { ...users[index], ...updates };
    this.saveUsers(users);
    
    const { passwordHash: _, ...safeUser } = users[index];
    return safeUser;
  }

  static async changeUserPassword(id: string, currentPasswordPlain: string, newPasswordPlain: string) {
    const users = this.getUsers();
    const index = users.findIndex(u => u.id === id);
    if (index === -1) throw new Error('User not found');

    const user = users[index];
    const isMatch = await bcrypt.compare(currentPasswordPlain, user.passwordHash);
    if (!isMatch) {
      throw new Error('Incorrect current password.');
    }

    user.passwordHash = await bcrypt.hash(newPasswordPlain, 10);
    this.saveUsers(users);
  }

  // --- JOB APPLICATIONS ---
  static getJobs(): JobApplication[] {
    try {
      return JSON.parse(fs.readFileSync(JOBS_FILE, 'utf-8'));
    } catch {
      return [];
    }
  }

  static saveJobs(jobs: JobApplication[]) {
    fs.writeFileSync(JOBS_FILE, JSON.stringify(jobs, null, 2), 'utf-8');
  }

  static getJobsByUserId(userId: string): JobApplication[] {
    return this.getJobs().filter(j => j.userId === userId);
  }

  static addJob(userId: string, job: Omit<JobApplication, 'id' | 'userId' | 'createdAt'>): JobApplication {
    const jobs = this.getJobs();
    const newJob: JobApplication = {
      ...job,
      id: 'job_' + Math.random().toString(36).substr(2, 9),
      userId,
      createdAt: new Date().toISOString()
    };
    jobs.push(newJob);
    this.saveJobs(jobs);
    return newJob;
  }

  static updateJob(userId: string, jobId: string, updates: Partial<Omit<JobApplication, 'id' | 'userId' | 'createdAt'>>): JobApplication {
    const jobs = this.getJobs();
    const index = jobs.findIndex(j => j.id === jobId && j.userId === userId);
    if (index === -1) throw new Error('Job application not found.');

    jobs[index] = { ...jobs[index], ...updates };
    this.saveJobs(jobs);
    return jobs[index];
  }

  static deleteJob(userId: string, jobId: string): string {
    const jobs = this.getJobs();
    const filtered = jobs.filter(j => !(j.id === jobId && j.userId === userId));
    this.saveJobs(filtered);
    return jobId;
  }

  // --- RESUMES ---
  static getResumes(): Resume[] {
    try {
      return JSON.parse(fs.readFileSync(RESUMES_FILE, 'utf-8'));
    } catch {
      return [];
    }
  }

  static saveResumes(resumes: Resume[]) {
    fs.writeFileSync(RESUMES_FILE, JSON.stringify(resumes, null, 2), 'utf-8');
  }

  static getResumesByUserId(userId: string): Resume[] {
    return this.getResumes().filter(r => r.userId === userId);
  }

  static addResume(userId: string, fileName: string, analysis: any): Resume {
    const resumes = this.getResumes();
    const newResume: Resume = {
      id: 'res_' + Math.random().toString(36).substr(2, 9),
      userId,
      fileName,
      analysis,
      uploadedAt: new Date().toISOString()
    };
    resumes.push(newResume);
    this.saveResumes(resumes);
    return newResume;
  }

  static deleteResume(userId: string, resumeId: string): string {
    const resumes = this.getResumes();
    const filtered = resumes.filter(r => !(r.id === resumeId && r.userId === userId));
    this.saveResumes(filtered);
    return resumeId;
  }
}
