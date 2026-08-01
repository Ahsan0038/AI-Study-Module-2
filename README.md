# Module 2 — Resume Upload, AI Analysis & Feedback Page

## Overview
This module implements the core AI-powered resume auditing feature of the AI Resume Analyzer project. It allows users to upload a resume, have it analyzed by Google's Gemini AI, and view the results on a structured feedback page.

## Features

### 1. Resume Upload Feature
- Upload a resume as a PDF or paste resume text directly.
- Optional target job role field to tailor the analysis.
- File is converted to Base64 on the client and sent securely to the backend — no third-party file storage required.

### 2. AI Resume Analysis Integration
- Resume content is sent to the **Gemini API** for analysis.
- A structured JSON response schema ensures consistent output: overall score, ATS compatibility score, suggestions, detected/missing skills, grammar notes, keywords, and a summary critique.
- Multi-model fallback (`gemini-2.5-pro` → `gemini-3.5-flash` → `gemini-2.5-flash` → `gemini-3.6-flash`) ensures the feature stays reliable even if one model is overloaded.
- Analysis results are saved to a local JSON data store, so history is preserved across server restarts.

### 3. Resume Feedback Page
- Circular score dials for Overall Resume Score and ATS Compatibility Rate.
- Actionable suggestions, skills breakdown (present vs. missing), keyword review, and grammar feedback.
- Downloadable report and a history panel to revisit or delete past analyses.
- Fully responsive layout (mobile and desktop).

## Tech Stack
- **Frontend:** React, TypeScript, Vite, Tailwind CSS
- **Backend:** Node.js, Express.js, TypeScript
- **AI:** Google Gemini API
- **Auth:** Firebase Authentication
- **Data Storage:** Local JSON file storage (`server/db.ts`)

## Files in This Module
| File | Purpose |
|---|---|
| `ResumeAnalyzer.tsx` | Resume upload UI and feedback page (frontend) |
| `App.tsx` | Connects UI actions to backend API calls |
| `types.ts` | TypeScript types for `Resume` and related data |
| `server.ts` | Express routes for analyze/history/delete resume endpoints |
| `db.ts` | Local JSON-based persistence layer |

## How It Works
1. User uploads a resume or pastes resume text on the Resume Analyzer page.
2. Frontend sends the data to `POST /api/resume/analyze`.
3. Backend forwards the content to the Gemini API with a structured prompt and schema.
4. The analysis result is saved locally and returned to the frontend.
5. The Feedback Page renders the result with score dials, suggestions, and detailed insights.

## Setup
1. Install dependencies: `npm install`
2. Add environment variables in a `.env` file (Gemini API key, Firebase config) — **never commit `.env`**.
3. Run the development server: `npm run dev`
