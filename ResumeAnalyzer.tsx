import React, { useState, useRef } from 'react';
import { Resume, ResumeAnalysis } from '../types';
import { 
  Upload, 
  FileText, 
  Sparkles, 
  CheckCircle2, 
  AlertTriangle, 
  ArrowRight, 
  Download, 
  Trash2, 
  Search, 
  RefreshCw,
  Clock,
  ListFilter,
  Check,
  ChevronRight,
  Plus
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { fileToBase64, getScoreColor } from '../utils/helpers';

interface ResumeAnalyzerProps {
  resumes: Resume[];
  onAnalyzeResume: (payload: { fileName: string; fileBase64?: string; mimeType?: string; resumeText?: string; targetJobRole?: string }) => Promise<Resume>;
  onDeleteResume: (id: string) => Promise<void>;
  showToast: (msg: string, type: 'success' | 'warning' | 'error' | 'info') => void;
}

export function ResumeAnalyzer({ 
  resumes, 
  onAnalyzeResume, 
  onDeleteResume, 
  showToast 
}: ResumeAnalyzerProps) {
  
  // App states
  const [activeResume, setActiveResume] = useState<Resume | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  
  // Input states
  const [targetJobRole, setTargetJobRole] = useState('');
  const [pastedText, setPastedText] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Tabs
  const [activeTab, setActiveTab] = useState<'summary' | 'skills' | 'ats' | 'grammar'>('summary');

  const steps = [
    "Reading file data stream...",
    "Extracting textual blocks...",
    "Initializing Gemini 3.5 parser...",
    "Benchmarking layout against ATS heuristics...",
    "Synthesizing constructive critique suggestions..."
  ];

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type === 'application/pdf') {
        setSelectedFile(file);
        setPastedText(''); // Clear pasted text if file uploaded
      } else {
        showToast('Only PDF files are supported for parsing.', 'warning');
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.value === '') return;
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.type === 'application/pdf') {
        setSelectedFile(file);
        setPastedText(''); // Clear pasted text if file uploaded
      } else {
        showToast('Only PDF files are supported for parsing.', 'warning');
      }
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const handleAnalysisSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile && !pastedText.trim()) {
      showToast('Please upload a PDF file or paste your resume text.', 'warning');
      return;
    }

    setLoading(true);
    setLoadingStep(0);

    // Simulate progressive loading messages
    const stepInterval = setInterval(() => {
      setLoadingStep(prev => (prev < steps.length - 1 ? prev + 1 : prev));
    }, 1500);

    try {
      let payload: { fileName: string; fileBase64?: string; mimeType?: string; resumeText?: string; targetJobRole?: string } = {
        fileName: '',
        targetJobRole
      };

      if (selectedFile) {
        const base64 = await fileToBase64(selectedFile);
        payload.fileBase64 = base64;
        payload.mimeType = selectedFile.type;
        payload.fileName = selectedFile.name;
      } else {
        payload.resumeText = pastedText;
        payload.fileName = `Pasted_Resume_${new Date().toISOString().split('T')[0]}.txt`;
      }

      const analyzed = await onAnalyzeResume(payload);
      setActiveResume(analyzed);
      showToast('Resume audit complete! Insights generated.', 'success');
      
      // Reset input form
      setSelectedFile(null);
      setPastedText('');
      setTargetJobRole('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (error: any) {
      console.error(error);
      showToast(error.message || 'Gemini API call failed. Verify your API Key.', 'error');
    } finally {
      clearInterval(stepInterval);
      setLoading(false);
    }
  };

  const handleDeleteHistory = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to remove this resume report from history?')) {
      try {
        await onDeleteResume(id);
        if (activeResume && activeResume.id === id) {
          setActiveResume(null);
        }
        showToast('Report removed.', 'success');
      } catch {
        showToast('Failed to delete report.', 'error');
      }
    }
  };

  const handleDownloadReport = () => {
    if (!activeResume) return;
    const { fileName, analysis } = activeResume;
    const reportText = `# Resume Analysis Report: ${fileName}
Date Analyzed: ${new Date(activeResume.uploadedAt).toLocaleString()}
Overall Score: ${analysis.score}/100
ATS Compatibility Score: ${analysis.atsScore}/100

## Executive Critique Summary
${analysis.summary}

## Actionable Suggestions
${analysis.suggestions.map((s, i) => `${i + 1}. ${s}`).join('\n')}

## Skill Audit
- Present: ${analysis.skills.present.join(', ')}
- Missing / Recommended: ${analysis.skills.missing.join(', ')}

## Keyword Density Suggestions
- Detected Industry Keywords: ${analysis.keywords.join(', ')}

## Grammar & Phrasing Corrections
${analysis.grammar.map((g, i) => `${i + 1}. ${g}`).join('\n')}
`;

    const blob = new Blob([reportText], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Resume_Analysis_${activeResume.id}.md`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Markdown report downloaded.', 'success');
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 pb-12">
      
      {/* Left Column: Form & History Panel */}
      <div className="space-y-6 lg:col-span-1">
        
        {/* Analyze Form Card */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800/50 p-6 rounded-2xl shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="w-5 h-5 text-indigo-600 dark:text-indigo-400 animate-pulse" />
            <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
              AI Resume Auditor
            </h2>
          </div>

          <form onSubmit={handleAnalysisSubmit} className="space-y-4">
            
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Target Job Role (Optional)</label>
              <input
                type="text"
                value={targetJobRole}
                onChange={(e) => setTargetJobRole(e.target.value)}
                placeholder="e.g. Senior Software Engineer"
                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500/15"
              />
              <p className="text-[10px] text-slate-400">Specifying a role tailors Gemini's skills recommendation engine.</p>
            </div>

            {/* Drag & Drop File Container */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Resume Source</label>
              
              <div
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                onClick={triggerFileInput}
                className={`border-2 border-dashed rounded-xl p-6 text-center transition cursor-pointer flex flex-col items-center justify-center min-h-[140px] relative overflow-hidden ${
                  dragActive 
                    ? 'border-indigo-500 bg-indigo-50/10 dark:bg-indigo-950/10' 
                    : selectedFile
                      ? 'border-emerald-500 bg-emerald-50/10 dark:bg-emerald-950/10'
                      : 'border-slate-200 dark:border-slate-850 hover:border-indigo-400 dark:hover:border-indigo-800 bg-slate-50/50 dark:bg-slate-950/10'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf"
                  onChange={handleFileChange}
                  className="hidden"
                />

                {selectedFile ? (
                  <>
                    <FileText className="w-8 h-8 text-emerald-500 mb-2" />
                    <span className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate max-w-xs">{selectedFile.name}</span>
                    <span className="text-xs text-slate-400 mt-1">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB • PDF selected</span>
                    <button 
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setSelectedFile(null); }}
                      className="absolute top-2 right-2 text-slate-400 hover:text-rose-500 text-xs font-bold bg-white dark:bg-slate-950 p-1 rounded-md border border-slate-100 dark:border-slate-850"
                    >
                      Clear
                    </button>
                  </>
                ) : (
                  <>
                    <Upload className="w-8 h-8 text-slate-400 mb-2" />
                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Upload PDF Resume</span>
                    <span className="text-xs text-slate-400 mt-1">Drag and drop file, or browse files</span>
                  </>
                )}
              </div>
            </div>

            {/* Fallback Text Input */}
            {!selectedFile && (
              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-400">Or Paste Text instead</span>
                  {pastedText && (
                    <button type="button" onClick={() => setPastedText('')} className="text-[10px] text-slate-400 hover:text-slate-600">Clear</button>
                  )}
                </div>
                <textarea
                  rows={4}
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  placeholder="Paste your professional experience, summary, education, and skills directly here..."
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500/15 resize-none"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={loading || (!selectedFile && !pastedText.trim())}
              className="w-full py-3 px-4 rounded-xl bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-white text-white dark:text-slate-950 font-medium flex items-center justify-center gap-2 shadow-sm transition disabled:opacity-50 cursor-pointer text-sm"
            >
              {loading ? (
                <div className="flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Analyzing Resume...</span>
                </div>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Begin AI Verification</span>
                </>
              )}
            </button>

          </form>
        </div>

        {/* History Panel */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800/50 p-6 rounded-2xl shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-4.5 h-4.5 text-slate-500" />
              <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">Analysis History</h3>
            </div>
            <span className="text-xs text-slate-500 font-bold bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">{resumes.length}</span>
          </div>

          {resumes.length > 0 ? (
            <div className="space-y-2.5 max-h-[280px] overflow-y-auto pr-1">
              {resumes.map((r) => {
                const isActive = activeResume && activeResume.id === r.id;
                const scoreColor = getScoreColor(r.analysis.score);
                return (
                  <div
                    key={r.id}
                    onClick={() => { setActiveResume(r); }}
                    className={`p-3 rounded-xl border transition cursor-pointer flex justify-between items-center gap-3 ${
                      isActive 
                        ? 'bg-slate-50 dark:bg-slate-950 border-slate-300 dark:border-slate-700' 
                        : 'border-slate-100 dark:border-slate-850 hover:bg-slate-50/50 dark:hover:bg-slate-950/20'
                    }`}
                  >
                    <div className="min-w-0 flex-grow space-y-0.5">
                      <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">{r.fileName}</p>
                      <p className="text-[10px] text-slate-400">
                        {new Date(r.uploadedAt).toLocaleDateString()}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${scoreColor.bg} ${scoreColor.text}`}>
                        {r.analysis.score}
                      </span>
                      <button
                        onClick={(e) => handleDeleteHistory(e, r.id)}
                        className="p-1 text-slate-400 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition cursor-pointer"
                        title="Remove"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8">
              <FileText className="w-8 h-8 text-slate-300 dark:text-slate-700 mx-auto mb-2" />
              <p className="text-xs text-slate-400">No previous audits found. Complete your first upload to populate history.</p>
            </div>
          )}
        </div>

      </div>

      {/* Right Column: Loading or Audit Results Dashboard */}
      <div className="lg:col-span-2">
        
        {loading ? (
          <div className="bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800/50 p-12 rounded-2xl shadow-sm text-center min-h-[450px] flex flex-col justify-center items-center space-y-6">
            <div className="relative">
              <div className="w-20 h-20 border-4 border-indigo-200 dark:border-indigo-950 rounded-full animate-spin border-t-indigo-600 dark:border-t-indigo-500" />
              <Sparkles className="w-6 h-6 text-indigo-500 absolute top-1/2 left-1/2 -translate-y-1/2 -translate-x-1/2 animate-bounce" />
            </div>
            
            <div className="space-y-2">
              <h3 className="font-display text-lg font-bold text-slate-900 dark:text-white">AI Engine Parsing</h3>
              <p className="text-xs text-slate-400 dark:text-slate-500 animate-pulse font-mono uppercase tracking-wider">{steps[loadingStep]}</p>
            </div>
            <div className="w-full max-w-xs h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <motion.div 
                className="h-full bg-indigo-600 rounded-full"
                animate={{ width: `${(loadingStep + 1) * 20}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>
          </div>
        ) : activeResume ? (
          <div className="space-y-6">
            
            {/* Header / Main Scores Summary Card */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800/50 p-6 rounded-2xl shadow-sm">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-6 border-b border-slate-100 dark:border-slate-800">
                <div className="space-y-1 min-w-0 w-full sm:w-auto">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 px-2.5 py-0.5 rounded-full uppercase tracking-wider">Audit Complete</span>
                    <span className="text-[10px] text-slate-400">ID: {activeResume.id}</span>
                  </div>
                  <h3 className="font-display text-xl font-bold text-slate-950 dark:text-white break-words">{activeResume.fileName}</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Evaluated on {new Date(activeResume.uploadedAt).toLocaleString()}</p>
                </div>

                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={handleDownloadReport}
                    className="flex items-center gap-1.5 py-2 px-3.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 rounded-xl font-semibold text-xs transition cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download Report</span>
                  </button>
                </div>
              </div>

              {/* Main Circular Score Heuristics */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6">
                
                {/* Overall Score Dial */}
                <div className="flex flex-col sm:flex-row items-center sm:items-center gap-3 sm:gap-5 p-4 rounded-xl bg-slate-50/50 dark:bg-slate-950/20 border border-slate-100 dark:border-slate-800 text-center sm:text-left">
                  <div className="relative flex-shrink-0 w-24 h-24 flex items-center justify-center">
                    {/* SVG Circular Dial */}
                    <svg className="w-full h-full transform -rotate-90">
                      <circle cx="48" cy="48" r="42" className="text-slate-200 dark:text-slate-800" strokeWidth="6" fill="transparent" />
                      <circle cx="48" cy="48" r="42" className={activeResume.analysis.score >= 80 ? 'text-emerald-500' : activeResume.analysis.score >= 60 ? 'text-amber-500' : 'text-rose-500'} strokeWidth="6" fill="transparent" strokeDasharray="264" strokeDashoffset={264 - (264 * activeResume.analysis.score) / 100} strokeLinecap="round" />
                    </svg>
                    <span className="absolute font-display font-bold text-xl text-slate-900 dark:text-white">{activeResume.analysis.score}%</span>
                  </div>

                  <div className="space-y-1 min-w-0 w-full">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Overall Resume Score</span>
                    <h4 className="font-bold text-slate-900 dark:text-white text-base break-words">
                      {activeResume.analysis.score >= 80 ? 'Excellent Standing' : activeResume.analysis.score >= 60 ? 'Needs Improvement' : 'Requires Redevelopment'}
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 break-words">Comprehensive score covering language, formatting, metrics, and technical density.</p>
                  </div>
                </div>

                {/* ATS Score Dial */}
                <div className="flex flex-col sm:flex-row items-center sm:items-center gap-3 sm:gap-5 p-4 rounded-xl bg-slate-50/50 dark:bg-slate-950/20 border border-slate-100 dark:border-slate-800 text-center sm:text-left">
                  <div className="relative flex-shrink-0 w-24 h-24 flex items-center justify-center">
                    {/* SVG Circular Dial */}
                    <svg className="w-full h-full transform -rotate-90">
                      <circle cx="48" cy="48" r="42" className="text-slate-200 dark:text-slate-800" strokeWidth="6" fill="transparent" />
                      <circle cx="48" cy="48" r="42" className={activeResume.analysis.atsScore >= 80 ? 'text-indigo-500' : activeResume.analysis.atsScore >= 60 ? 'text-sky-500' : 'text-rose-500'} strokeWidth="6" fill="transparent" strokeDasharray="264" strokeDashoffset={264 - (264 * activeResume.analysis.atsScore) / 100} strokeLinecap="round" />
                    </svg>
                    <span className="absolute font-display font-bold text-xl text-slate-900 dark:text-white">{activeResume.analysis.atsScore}%</span>
                  </div>

                  <div className="space-y-1 min-w-0 w-full">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">ATS Compatibility Rate</span>
                    <h4 className="font-bold text-slate-900 dark:text-white text-base break-words">
                      {activeResume.analysis.atsScore >= 80 ? 'Highly Parseable' : activeResume.analysis.atsScore >= 60 ? 'Moderate Scanner Risk' : 'High Scanner Failure Risk'}
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 break-words">Measures visual structures, key dividers, typography spacing, and buzzword parsing compliance.</p>
                  </div>
                </div>

              </div>

            </div>

            {/* Structured Tabs Content */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800/50 rounded-2xl shadow-sm overflow-hidden">
              
              {/* Tab Headers */}
              <div className="flex border-b border-slate-100 dark:border-slate-800 overflow-x-auto">
                {[
                  { id: 'summary', name: 'Executive Critique' },
                  { id: 'skills', name: 'Skills & Keywords' },
                  { id: 'ats', name: 'Improvement suggestions' },
                  { id: 'grammar', name: 'Grammar & phrasing' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`px-5 py-3.5 text-xs font-semibold tracking-wide uppercase border-b-2 whitespace-nowrap transition cursor-pointer ${
                      activeTab === tab.id 
                        ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400 bg-slate-50/50 dark:bg-slate-950/20' 
                        : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    {tab.name}
                  </button>
                ))}
              </div>

              {/* Tab Contents */}
              <div className="p-6">
                
                {activeTab === 'summary' && (
                  <div className="space-y-4">
                    <div className="prose dark:prose-invert max-w-none text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                      <p className="font-semibold text-slate-900 dark:text-white text-base mb-2">Resume Assessment Summary:</p>
                      {activeResume.analysis.summary.split('\n\n').map((para, i) => (
                        <p key={i} className="mb-3">{para}</p>
                      ))}
                    </div>

                    <div className="p-4 bg-indigo-50/50 dark:bg-slate-950/40 rounded-xl border border-indigo-100/50 dark:border-indigo-950/50 flex gap-3 mt-6">
                      <Sparkles className="w-5 h-5 text-indigo-600 dark:text-indigo-400 flex-shrink-0" />
                      <p className="text-xs text-indigo-900 dark:text-indigo-300 leading-relaxed">
                        <span className="font-bold">Pro Tip:</span> Re-analyze your resume after making corrections to verify updated scores. Make sure to download this report to have the checklists offline.
                      </p>
                    </div>
                  </div>
                )}

                {activeTab === 'skills' && (
                  <div className="space-y-6">
                    
                    {/* Detected Skills */}
                    <div className="space-y-2.5">
                      <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        <span>Present Skills & Competencies ({activeResume.analysis.skills.present.length})</span>
                      </h4>
                      <div className="flex flex-wrap gap-1.5">
                        {activeResume.analysis.skills.present.map((skill, i) => (
                          <span key={i} className="text-xs px-2.5 py-1 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400 font-medium rounded-lg border border-emerald-100/50 dark:border-emerald-950/50">
                            {skill}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Missing Skills */}
                    <div className="space-y-2.5 pt-4 border-t border-slate-100 dark:border-slate-800">
                      <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 text-amber-500" />
                        <span>Recommended Missing Skills ({activeResume.analysis.skills.missing.length})</span>
                      </h4>
                      <p className="text-xs text-slate-500">Injecting these key skills into your summaries or roles will optimize search match indexing for your target role:</p>
                      <div className="flex flex-wrap gap-1.5">
                        {activeResume.analysis.skills.missing.map((skill, i) => (
                          <span key={i} className="text-xs px-2.5 py-1 bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400 font-medium rounded-lg border border-amber-100/50 dark:border-amber-950/50">
                            {skill}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Keyword recommendations */}
                    <div className="space-y-2.5 pt-4 border-t border-slate-100 dark:border-slate-800">
                      <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                        Keyword Scan Optimization
                      </h4>
                      <p className="text-xs text-slate-500">High-scoring industry buzzwords detected or suggested to build semantic density:</p>
                      <div className="flex flex-wrap gap-1.5">
                        {activeResume.analysis.keywords.map((kw, i) => (
                          <span key={i} className="text-xs px-2.5 py-1 bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 font-medium rounded-lg">
                            {kw}
                          </span>
                        ))}
                      </div>
                    </div>

                  </div>
                )}

                {activeTab === 'ats' && (
                  <div className="space-y-4">
                    <p className="text-xs text-slate-500">Actionable modifications recommended by AI to increase visual score and clear scanner indexing parses:</p>
                    <div className="space-y-2.5">
                      {activeResume.analysis.suggestions.map((suggestion, i) => (
                        <div key={i} className="flex gap-3 p-3.5 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20">
                          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 text-xs font-bold flex items-center justify-center">
                            {i + 1}
                          </span>
                          <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed mt-0.5">{suggestion}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {activeTab === 'grammar' && (
                  <div className="space-y-4">
                    <p className="text-xs text-slate-500">Phrasings, grammar revisions, or layout styling options to improve professionalism and delivery impact:</p>
                    {activeResume.analysis.grammar.length > 0 ? (
                      <div className="space-y-2.5">
                        {activeResume.analysis.grammar.map((item, i) => (
                          <div key={i} className="flex gap-3 p-3 border-l-4 border-rose-400 dark:border-rose-900 bg-rose-50/20 dark:bg-rose-950/5 rounded-r-xl">
                            <span className="text-xs font-bold text-rose-500">Review {i + 1}</span>
                            <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">{item}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <Check className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                        <p className="text-xs text-slate-500">Grammar structure and action verb phrasing are clear! No typos or passive voice flags identified.</p>
                      </div>
                    )}
                  </div>
                )}

              </div>

            </div>

          </div>
        ) : (
          <div className="bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800/50 p-12 rounded-2xl shadow-sm text-center min-h-[450px] flex flex-col justify-center items-center">
            <Sparkles className="w-12 h-12 text-indigo-300 dark:text-indigo-700 animate-pulse mb-4" />
            <h3 className="font-display text-lg font-bold text-slate-900 dark:text-white">Begin Resume Evaluation</h3>
            <p className="text-sm text-slate-400 max-w-md mx-auto mt-2 leading-relaxed">
              Upload your PDF resume or paste its details on the left, add a target job role, and run Gemini AI audit checks to generate ATS scores, keyword checklists, and recommendations.
            </p>
          </div>
        )}

      </div>

    </div>
  );
}
