# DocMind Frontend

Next.js frontend for DocMind — an AI document chat application.

**Live App:** https://docmind-frontend-eight.vercel.app  
**Backend Repo:** https://github.com/yahyahus/docmind

## Tech Stack
- **Framework:** Next.js 14 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **HTTP Client:** Axios with JWT interceptors
- **Auth:** JWT tokens stored in cookies
- **Deployment:** Vercel

## Features
- Register and login with JWT authentication
- Upload PDF and TXT documents
- Process documents for AI (creates vector embeddings)
- Chat with documents using RAG pipeline
- Real-time chat UI with typing indicators
- Search documents by title
- Persistent conversations per document

## Pages
| Route | Description |
|-------|-------------|
| / | Redirects to dashboard or login |
| /login | Email + password login |
| /register | Account creation |
| /dashboard | Document management |
| /chat/[id] | AI chat interface |

## Local Setup
```bash
git clone https://github.com/yahyahus/docmind-frontend
cd docmind-frontend
npm install
# Create .env.local with NEXT_PUBLIC_API_URL
npm run dev
```