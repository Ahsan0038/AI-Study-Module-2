/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Auth } from './pages/Auth';
import { Dashboard } from './pages/Dashboard';
import { ResumeAnalyzer } from './pages/ResumeAnalyzer';
import { JobTracker } from './pages/JobTracker';
import { Profile } from './pages/Profile';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
import { Toast, ToastItem, ToastType } from './components/Toast';
import { JobApplication, Resume } from './types';

// Firebase imports
import { 
  collection, 
  doc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  getDocs, 
  query, 
  where 
} from 'firebase/firestore';
import { db } from './lib/firebase';

function AppContent() {
  const { user, token, loading, getAuthHeaders, isFirebase } = useAuth();
  const [currentView, setCurrentView] = useState<string>('dashboard');
  
  // Data lists
  const [jobs, setJobs] = useState<JobApplication[]>([]);
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [dataLoading, setDataLoading] = useState(false);

  // Add application modal trigger state (shared between Dashboard and JobTracker)
  const [isAddJobModalOpen, setIsAddJobModalOpen] = useState(false);

  // Toast notifications state
  const [toast, setToast] = useState<ToastItem | null>(null);

  const showToast = (message: string, type: ToastType) => {
    setToast({
      id: Math.random().toString(),
      message,
      type
    });
  };

  // Fetch jobs and resumes when token is verified
  useEffect(() => {
    if (!token || !user) {
      setJobs([]);
      setResumes([]);
      return;
    }

    const fetchData = async () => {
      setDataLoading(true);
      try {
        const headers = await getAuthHeaders();

        // Resumes are always stored locally now (not in Firestore), so always fetch from the backend.
        const resumesPromise = fetch('/api/resume/history', { headers }).then(r => r.ok ? r.json() : Promise.reject(r));

        if (isFirebase) {
          // Jobs still come from Firestore directly
          const qJobs = query(collection(db, 'jobs'), where('userId', '==', user.id));

          const [jobsSnapshot, resumesData] = await Promise.all([
            getDocs(qJobs),
            resumesPromise
          ]);

          const jobsList = jobsSnapshot.docs.map(doc => doc.data() as JobApplication);

          // Sort arrays client-side for consistent ordering
          jobsList.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
          resumesData.sort((a: Resume, b: Resume) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());

          setJobs(jobsList);
          setResumes(resumesData);
        } else {
          // Fallback to Express Local JSON endpoints for everything
          const [jobsRes, resumesData] = await Promise.all([
            fetch('/api/jobs', { headers }),
            resumesPromise
          ]);

          if (jobsRes.ok) {
            const jobsData = await jobsRes.json();
            setJobs(jobsData);
            setResumes(resumesData);
          } else {
            showToast('Failed to load tracked records from the server.', 'error');
          }
        }
      } catch (err) {
        console.error('Error fetching dashboard records:', err);
        showToast('Server connection failed.', 'error');
      } finally {
        setDataLoading(false);
      }
    };

    fetchData();
  }, [token, user, isFirebase]);

  // Core Job API Operations
  const handleAddJob = async (jobPayload: Omit<JobApplication, 'id' | 'userId' | 'createdAt'>) => {
    if (isFirebase && user) {
      try {
        const jobRef = doc(collection(db, 'jobs'));
        const newJob: JobApplication = {
          ...jobPayload,
          id: jobRef.id,
          userId: user.id,
          createdAt: new Date().toISOString()
        };
        await setDoc(jobRef, newJob);
        setJobs(prev => [newJob, ...prev]);
        showToast('Job application tracked in Firestore!', 'success');
      } catch (err: any) {
        console.error('Error adding job to Firestore:', err);
        throw new Error(err.message || 'Failed to write application to Firestore.');
      }
    } else {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers,
        body: JSON.stringify(jobPayload),
      });
      
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to add job application.');
      }

      setJobs(prev => [data, ...prev]);
    }
  };

  const handleUpdateJob = async (id: string, updates: Partial<JobApplication>) => {
    if (isFirebase) {
      try {
        const jobRef = doc(db, 'jobs', id);
        await updateDoc(jobRef, updates);
        setJobs(prev => prev.map(job => job.id === id ? { ...job, ...updates } : job));
        showToast('Job application status updated!', 'success');
      } catch (err: any) {
        console.error('Error updating Firestore job:', err);
        throw new Error(err.message || 'Failed to edit Firestore document.');
      }
    } else {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/jobs/${id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(updates),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update job details.');
      }

      setJobs(prev => prev.map(job => job.id === id ? data : job));
    }
  };

  const handleDeleteJob = async (id: string) => {
    if (isFirebase) {
      try {
        const jobRef = doc(db, 'jobs', id);
        await deleteDoc(jobRef);
        setJobs(prev => prev.filter(job => job.id !== id));
        showToast('Application record removed.', 'success');
      } catch (err: any) {
        console.error('Error deleting from Firestore:', err);
        throw new Error(err.message || 'Failed to remove Firestore document.');
      }
    } else {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/jobs/${id}`, {
        method: 'DELETE',
        headers,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete application.');
      }

      setJobs(prev => prev.filter(job => job.id !== id));
    }
  };

  // Core Resume API Operations
  const handleAnalyzeResume = async (payload: { fileName: string; fileBase64?: string; mimeType?: string; resumeText?: string; targetJobRole?: string }) => {
    const fileUrl = '';

    const headers = await getAuthHeaders();
    const res = await fetch('/api/resume/analyze', {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...payload, fileUrl }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Error auditing resume.');
    }

    // Append analyzed record to local state list
    setResumes(prev => [data, ...prev]);
    return data;
  };

  const handleDeleteResume = async (id: string) => {
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/resume/${id}`, {
      method: 'DELETE',
      headers,
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to delete report.');
    }

    setResumes(prev => prev.filter(r => r.id !== id));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col justify-center items-center">
        <div className="w-12 h-12 border-4 border-indigo-200 dark:border-indigo-950 rounded-full animate-spin border-t-indigo-600" />
        <span className="text-xs font-semibold text-slate-400 mt-4 tracking-wider uppercase">Loading security context...</span>
      </div>
    );
  }

  // Auth Guard
  if (!user) {
    return (
      <>
        <Auth showToast={showToast} />
        <Toast toast={toast} onClose={() => setToast(null)} />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col transition-colors duration-300">
      
      {/* Top Navbar */}
      <Navbar currentView={currentView} onNavigate={setCurrentView} />

      {/* Main Structural Layout */}
      <div className="flex flex-1">
        
        {/* Desktop Sidebar */}
        <Sidebar currentView={currentView} onNavigate={setCurrentView} />

        {/* Content Panel Area */}
        <main className="flex-1 p-4 md:p-8 overflow-y-auto max-w-7xl mx-auto w-full">
          {dataLoading && (
            <div className="flex items-center gap-2 mb-4 text-xs font-semibold text-indigo-600 dark:text-indigo-400">
              <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
              <span>Fetching latest updates from backend database...</span>
            </div>
          )}

          {isFirebase && (
            <div className="mb-4 text-[10px] text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-lg flex items-center gap-1.5 font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>Connected directly to cloud Firestore database & Firebase Storage bucket</span>
            </div>
          )}

          {currentView === 'dashboard' && (
            <Dashboard 
              jobs={jobs} 
              resumes={resumes} 
              onNavigate={setCurrentView} 
              onAddJobClick={() => { setCurrentView('tracker'); setIsAddJobModalOpen(true); }}
            />
          )}

          {currentView === 'analyzer' && (
            <ResumeAnalyzer 
              resumes={resumes} 
              onAnalyzeResume={handleAnalyzeResume} 
              onDeleteResume={handleDeleteResume}
              showToast={showToast}
            />
          )}

          {currentView === 'tracker' && (
            <JobTracker 
              jobs={jobs} 
              onAddJob={handleAddJob} 
              onUpdateJob={handleUpdateJob} 
              onDeleteJob={handleDeleteJob}
              showToast={showToast}
              isAddModalOpen={isAddJobModalOpen}
              setIsAddModalOpen={setIsAddJobModalOpen}
            />
          )}

          {currentView === 'profile' && (
            <Profile showToast={showToast} />
          )}
        </main>

      </div>

      {/* Global Toast Alerts */}
      <Toast toast={toast} onClose={() => setToast(null)} />

    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
