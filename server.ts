import express, { Response } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { GoogleGenAI, Type } from '@google/genai';
import { DB } from './server/db.js';
import { authenticateToken, AuthenticatedRequest, initFirebaseAdmin } from './server/middleware/auth.js';
import { getFirestore } from 'firebase-admin/firestore';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProd = process.env.NODE_ENV === 'production';
const PORT = 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'ai_resume_analyzer_fallback_secret_338942';

async function createServer() {
  const app = express();
  // Support payload up to 15MB for base64 file uploads (resumes)
  app.use(express.json({ limit: '15mb' }));
  app.use(express.urlencoded({ limit: '15mb', extended: true }));

  // --- PUBLIC API / STATUS ---
  app.get('/api/status', (req, res) => {
    res.json({
      status: 'ok',
      time: new Date().toISOString(),
      apiKeyConfigured: !!process.env.GEMINI_API_KEY
    });
  });

  // Get Firebase Web Configuration dynamically
  app.get('/api/firebase-config', (req, res) => {
    res.json({
      apiKey: process.env.VITE_FIREBASE_API_KEY || '',
      authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || '',
      projectId: process.env.VITE_FIREBASE_PROJECT_ID || '',
      storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || '',
      messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
      appId: process.env.VITE_FIREBASE_APP_ID || '',
    });
  });

  // --- AUTHENTICATION ROUTES ---
  
  // Register
  app.post('/api/auth/register', async (req, res) => {
    const { email, password, fullName } = req.body;
    if (!email || !password || !fullName) {
      return res.status(400).json({ error: 'All fields (email, password, fullName) are required.' });
    }

    try {
      const user = await DB.createUser(email, password, fullName);
      const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
      res.status(201).json({ user, token });
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Registration failed.' });
    }
  });

  // Login
  app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    try {
      const user = DB.getUserByEmail(email);
      if (!user) {
        return res.status(401).json({ error: 'Invalid email or password.' });
      }

      const isMatch = await bcrypt.compare(password, user.passwordHash);
      if (!isMatch) {
        return res.status(401).json({ error: 'Invalid email or password.' });
      }

      const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
      const { passwordHash, ...safeUser } = user;
      res.json({ user: safeUser, token });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Login failed.' });
    }
  });

  // Get Me
  app.get('/api/auth/me', authenticateToken, (req: AuthenticatedRequest, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
    
    const user = DB.getUserById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }
    res.json(user);
  });

  // Update Profile
  app.put('/api/auth/profile', authenticateToken, (req: AuthenticatedRequest, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
    const { fullName, title, profilePicture } = req.body;

    try {
      const updatedUser = DB.updateUserProfile(req.user.id, { fullName, title, profilePicture });
      res.json(updatedUser);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Change Password
  app.post('/api/auth/change-password', authenticateToken, async (req: AuthenticatedRequest, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new passwords are required.' });
    }

    try {
      await DB.changeUserPassword(req.user.id, currentPassword, newPassword);
      res.json({ success: true, message: 'Password updated successfully.' });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });


  // --- JOB APPLICATIONS ROUTES ---

  // Get all job applications for user
  app.get('/api/jobs', authenticateToken, async (req: AuthenticatedRequest, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
    
    const useFirebase = initFirebaseAdmin();
    if (useFirebase) {
      try {
        const dbAdmin = getFirestore();
        const snapshot = await dbAdmin.collection('jobs').where('userId', '==', req.user.id).get();
        const jobs = snapshot.docs.map(doc => doc.data());
        jobs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        return res.json(jobs);
      } catch (error: any) {
        return res.status(500).json({ error: error.message });
      }
    } else {
      const jobs = DB.getJobsByUserId(req.user.id);
      res.json(jobs);
    }
  });

  // Create a job application
  app.post('/api/jobs', authenticateToken, async (req: AuthenticatedRequest, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
    const { company, title, url, date, status, notes, salary, location, type } = req.body;

    if (!company || !title || !date || !status) {
      return res.status(400).json({ error: 'Company, title, date, and status are required.' });
    }

    const useFirebase = initFirebaseAdmin();
    if (useFirebase) {
      try {
        const dbAdmin = getFirestore();
        const docRef = dbAdmin.collection('jobs').doc();
        const newJob = {
          id: docRef.id,
          userId: req.user.id,
          company,
          title,
          url: url || '',
          date,
          status,
          notes: notes || '',
          salary: salary || '',
          location: location || '',
          type: type || 'Remote',
          createdAt: new Date().toISOString()
        };
        await docRef.set(newJob);
        res.status(201).json(newJob);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    } else {
      try {
        const job = DB.addJob(req.user.id, { company, title, url, date, status, notes, salary, location, type });
        res.status(201).json(job);
      } catch (error: any) {
        res.status(400).json({ error: error.message });
      }
    }
  });

  // Update a job application
  app.put('/api/jobs/:id', authenticateToken, async (req: AuthenticatedRequest, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
    const jobId = req.params.id;
    const { company, title, url, date, status, notes, salary, location, type } = req.body;

    const useFirebase = initFirebaseAdmin();
    if (useFirebase) {
      try {
        const dbAdmin = getFirestore();
        const docRef = dbAdmin.collection('jobs').doc(jobId);
        const docSnap = await docRef.get();
        if (!docSnap.exists || docSnap.data()?.userId !== req.user.id) {
          return res.status(404).json({ error: 'Job application not found.' });
        }
        
        const updates: any = {};
        if (company !== undefined) updates.company = company;
        if (title !== undefined) updates.title = title;
        if (url !== undefined) updates.url = url;
        if (date !== undefined) updates.date = date;
        if (status !== undefined) updates.status = status;
        if (notes !== undefined) updates.notes = notes;
        if (salary !== undefined) updates.salary = salary;
        if (location !== undefined) updates.location = location;
        if (type !== undefined) updates.type = type;

        await docRef.update(updates);
        res.json({ ...docSnap.data(), ...updates });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    } else {
      try {
        const updated = DB.updateJob(req.user.id, jobId, { company, title, url, date, status, notes, salary, location, type });
        res.json(updated);
      } catch (error: any) {
        res.status(400).json({ error: error.message });
      }
    }
  });

  // Delete a job application
  app.delete('/api/jobs/:id', authenticateToken, async (req: AuthenticatedRequest, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
    const jobId = req.params.id;

    const useFirebase = initFirebaseAdmin();
    if (useFirebase) {
      try {
        const dbAdmin = getFirestore();
        const docRef = dbAdmin.collection('jobs').doc(jobId);
        const docSnap = await docRef.get();
        if (!docSnap.exists || docSnap.data()?.userId !== req.user.id) {
          return res.status(404).json({ error: 'Job application not found.' });
        }
        await docRef.delete();
        res.json({ success: true, deletedId: jobId });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    } else {
      try {
        const deletedId = DB.deleteJob(req.user.id, jobId);
        res.json({ success: true, deletedId });
      } catch (error: any) {
        res.status(400).json({ error: error.message });
      }
    }
  });


  // --- RESUME ANALYZER ROUTES ---

  // Get user's resume history
  app.get('/api/resume/history', authenticateToken, async (req: AuthenticatedRequest, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });

    try {
      const resumes = DB.getResumesByUserId(req.user.id);
      res.json(resumes);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Delete an old analyzed resume from history
  app.delete('/api/resume/:id', authenticateToken, async (req: AuthenticatedRequest, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
    const resumeId = req.params.id;

    try {
      const deletedId = DB.deleteResume(req.user.id, resumeId);
      res.json({ success: true, deletedId });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Analyze Resume using Gemini API
  app.post('/api/resume/analyze', authenticateToken, async (req: AuthenticatedRequest, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
    
    const { fileName, fileBase64, mimeType, resumeText, targetJobRole, fileUrl } = req.body;

    if (!resumeText && !fileBase64) {
      return res.status(400).json({ error: 'Either a PDF file upload or direct resume text input is required.' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        error: 'Google Gemini API Key is not configured on the server. Please configure your API key in AI Studio Secrets.'
      });
    }

    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      // Prepare Gemini contents payload
      const contents: any[] = [];
      let inputSourceInfo = '';

      if (fileBase64 && mimeType) {
        // Strip base64 headers if present
        const cleanBase64 = fileBase64.includes('base64,') 
          ? fileBase64.split('base64,')[1] 
          : fileBase64;
          
        contents.push({
          inlineData: {
            data: cleanBase64,
            mimeType: mimeType
          }
        });
        inputSourceInfo = 'analyzing the uploaded document file';
      } else if (resumeText) {
        contents.push({
          text: resumeText
        });
        inputSourceInfo = `analyzing the following raw resume text: \n\n${resumeText}`;
      }

      const analysisPrompt = `Perform a rigorous, professional Resume Analysis, ATS optimization review, and Grammar alignment check.
      ${targetJobRole ? `Targeting job role: "${targetJobRole}"` : 'Targeting standard high-performing industry roles'}.
      
      You must return a valid JSON matching this schema precisely:
      - score: overall score (0 to 100) based on content depth, structure, metrics, and professional language.
      - suggestions: array of 4 to 8 highly actionable, specific suggestions to improve content, impact verbs, and missing metrics.
      - skills: object containing:
        - present: list of keywords/skills successfully detected.
        - missing: list of crucial technical, soft, or domain skills that are missing but highly requested for this background/target role.
      - grammar: list of phrases, sentences, or layout-related elements to correct (e.g. typos, weak verbs, passive voice, or poorly phrased headers).
      - atsScore: ATS structure & scanning score (0 to 100) looking at standard parser compatibility.
      - keywords: list of high-value industry terms/buzzwords present or recommended to inject to pass keyword screening.
      - summary: detailed executive summary (2-3 paragraphs) explaining strengths, structural issues, and overall impression.

      We are ${inputSourceInfo}. Evaluate thoroughly. Give constructive criticism and actionable items.`;

      contents.push(analysisPrompt);

      const responseSchemaConfig = {
        systemInstruction: "You are an elite talent acquisition expert, senior career coach, and ATS specialist. Your goal is to critically analyze resumes, provide deep insights, actionable layout & formatting corrections, and key optimization items to help candidates secure top-tier interviews.",
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            score: { type: Type.INTEGER, description: "Overall quality score of the resume (0-100)" },
            suggestions: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Actionable content improvement items."
            },
            skills: {
              type: Type.OBJECT,
              properties: {
                present: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: "Skills and competencies detected in the resume."
                },
                missing: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: "Recommended missing skills to add for target role/industry."
                }
              },
              required: ["present", "missing"]
            },
            grammar: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Typographical, formatting, stylistic, or phrasing recommendations."
            },
            atsScore: { type: Type.INTEGER, description: "ATS parser compatibility score (0-100)" },
            keywords: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Relevant industry keywords detected or recommended."
            },
            summary: { type: Type.STRING, description: "Executive professional critique of the resume." }
          },
          required: ["score", "suggestions", "skills", "grammar", "atsScore", "keywords", "summary"]
        }
      };

      // Try multiple models in order, prioritizing quality first; if one is overloaded
      // (503), unavailable, or fails, fall through to the next one automatically.
      const MODEL_FALLBACK_LIST = ['gemini-2.5-pro', 'gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-3.6-flash'];
      const PER_MODEL_TIMEOUT_MS = 45000;

      let response: any = null;
      let lastError: any = null;

      for (const modelName of MODEL_FALLBACK_LIST) {
        try {
          console.log(`[resume/analyze] Trying model: ${modelName}...`);

          const geminiCallPromise = ai.models.generateContent({
            model: modelName,
            contents: contents,
            config: responseSchemaConfig
          });

          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error(`Model ${modelName} timed out after ${PER_MODEL_TIMEOUT_MS / 1000}s`)), PER_MODEL_TIMEOUT_MS);
          });

          response = await Promise.race([geminiCallPromise, timeoutPromise]);
          console.log(`[resume/analyze] Success with model: ${modelName}`);
          break; // got a valid response, stop trying further models
        } catch (modelErr: any) {
          lastError = modelErr;
          const errMsg = modelErr?.message || String(modelErr);
          console.warn(`[resume/analyze] Model ${modelName} failed: ${errMsg}`);
          // Try next model in the list regardless of error type (503 overloaded, timeout, etc.)
          continue;
        }
      }

      if (!response) {
        throw new Error(
          `All Gemini models are currently unavailable. Last error: ${lastError?.message || 'unknown error'}. Please try again in a moment.`
        );
      }

      console.log('[resume/analyze] Received response from Gemini API.');

      const responseText = response.text;
      if (!responseText) {
        throw new Error('Gemini API returned an empty critique.');
      }

      const parsedAnalysis = JSON.parse(responseText.trim());

      const savedResume = DB.addResume(req.user.id, fileName || 'Resume.pdf', parsedAnalysis);

      return res.status(200).json(savedResume);
    } catch (error: any) {
      console.error('Error in Resume Analyzer endpoint:', error);
      res.status(500).json({ error: error.message || 'Failed to analyze resume with Gemini.' });
    }
  });


  // --- VITE AND STATIC ASSETS HANDLING ---
  
  let vite: any;
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'custom',
    });
    app.use(vite.middlewares);
    
    app.use('*', async (req, res, next) => {
      const url = req.originalUrl;
      try {
        let template = fs.readFileSync(path.resolve(__dirname, 'index.html'), 'utf-8');
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.use('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist/index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running at http://localhost:${PORT} in ${isProd ? 'production' : 'development'} mode.`);
  });
}

createServer();