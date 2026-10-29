# ClearDesk AI

**AI-assisted invoice review with human oversight.**

ClearDesk AI is a hackathon prototype designed to help small businesses review invoice information, identify missing details and potential inconsistencies, and organize review work before a person makes a decision.

## Features

- AI-assisted invoice analysis from submitted text.
- Detection of missing invoice information and potential inconsistencies.
- Document queue for organizing review work.
- Exact duplicate-text warnings.
- Review tracking with a Mark as Reviewed action.
- Browser local storage for document and review state.
- Human-in-the-loop workflow: AI findings support review but do not automatically approve or pay invoices.

## Technology

- React
- TypeScript
- Vite
- Node.js and Express
- Meta Model API integration through the backend

## Requirements

- Node.js and npm.
- A valid Meta Model API key with access to the configured model.

## Getting started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure the API key

Create a `.env` file in the project root and add:

```env
MODEL_API_KEY=your_api_key_here
```

Replace the placeholder with your own API key. Never commit `.env` or share its contents publicly. The backend reads the key so it does not need to be placed in frontend code.

### 3. Start the backend

Open a terminal in the project folder and run:

```bash
node ./server/index.js
```

The backend runs at `http://localhost:3001` by default.

Health check: `http://localhost:3001/api/health`

### 4. Start the frontend

Open a second terminal in the project folder and run:

```bash
npm run dev
```

Open the local URL printed by Vite, typically `http://localhost:5173`.

### 5. Build and lint

```bash
npm run build
npm run lint
```

## API endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/health` | Reports backend health and whether the API key is configured |
| POST | `/api/analyze` | Accepts document text and returns AI-assisted analysis |

## Current limitations

- Automatic text analysis supports `.txt` and `.csv` inputs.
- PDF and image files are not automatically extracted or analyzed in the current prototype.
- AI findings may be incomplete or incorrect and must be checked by a person.
- Browser local storage is specific to the browser and is not a centralized database.
- This prototype does not replace accounting controls, professional judgment, or independent payment verification.

## Security

- Keep API keys in the backend environment, never in frontend source code.
- Do not commit `.env`, credentials, private keys, or sensitive invoice records.
- Use fictional or sanitized examples in public demonstrations.
- Never treat AI-generated findings as proof of fraud or as authorization to make a payment.

## Project status

ClearDesk AI is a hackathon prototype demonstrating an AI-assisted invoice-review workflow with human oversight. It is not presented as a production-grade financial verification system.

## License

No license has been selected yet. Decide on the intended repository license before publishing.
