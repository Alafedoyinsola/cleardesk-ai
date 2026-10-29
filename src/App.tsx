import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import './App.css'

type DocumentStatus = 'Needs review' | 'Flagged' | 'Reviewed'
type Severity = 'Low' | 'Medium' | 'High'
type Assessment = 'Observed' | 'Missing' | 'Unclear' | 'Unverified'

type DocumentItem = {
  id: number
  name: string
  type: string
  date: string
  amount: string
  reference: string
  status: DocumentStatus
  finding: string
}

type RiskIndicator = {
  title: string
  severity: Severity
  evidence: string
  explanation: string
}

type EvidenceItem = {
  field: string
  value: string
  assessment: Assessment
}

type StructuredAnalysis = {
  reviewStatus: string
  summary: string
  riskIndicators: RiskIndicator[]
  evidence: EvidenceItem[]
  recommendedActions: string[]
}

type UploadedText = { name: string; text: string }

type DocumentAnalysis = {
  analysis: string
  analyzing: boolean
  error: string
  structured: StructuredAnalysis | null
  structuredAvailable: boolean
}

const emptyAnalysis = (): DocumentAnalysis => ({
  analysis: '',
  analyzing: false,
  error: '',
  structured: null,
  structuredAvailable: false,
})

function normalizeInvoiceText(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
}

function findExactDuplicate(
  text: string,
  previous: UploadedText[],
): string | null {
  const normalized = normalizeInvoiceText(text)
  if (!normalized) return null

  const match = previous.find(
    (item) => normalizeInvoiceText(item.text) === normalized,
  )

  return match
    ? `This document's text matches the earlier upload "${match.name}". Verify whether it is a duplicate before taking action.`
    : null
}

const initialDocuments: DocumentItem[] = [
  {
    id: 1,
    name: 'Invoice-1048.pdf',
    type: 'Invoice',
    date: 'Oct 28, 2026',
    amount: '$2,450.00',
    reference: 'INV-1048',
    status: 'Flagged',
    finding: 'The invoice amount differs from the recorded payment.',
  },
  {
    id: 2,
    name: 'Payment-confirmation.pdf',
    type: 'Payment confirmation',
    date: 'Oct 27, 2026',
    amount: '$890.00',
    reference: 'PAY-2081',
    status: 'Needs review',
    finding: 'Confirm that the payment reference matches the invoice.',
  },
  {
    id: 3,
    name: 'Office-supplies-receipt.pdf',
    type: 'Receipt',
    date: 'Oct 26, 2026',
    amount: '$156.40',
    reference: 'REC-0732',
    status: 'Reviewed',
    finding: 'Sample record marked reviewed. Verify against the original document.',
  },
]

const STORAGE_KEY = 'cleardesk-ai:v1'

type PersistedAppState = {
  documents: DocumentItem[]
  selectedId: number
  documentTexts: Record<number, string>
  analyses: Record<number, DocumentAnalysis>
  duplicateWarnings: Record<number, string | null>
  previousUploads: UploadedText[]
}

function loadPersistedState(): PersistedAppState | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null

    const parsed = JSON.parse(raw) as Partial<PersistedAppState>
    const validStatuses: DocumentStatus[] = [
      'Needs review',
      'Flagged',
      'Reviewed',
    ]

    if (
      !Array.isArray(parsed.documents) ||
      parsed.documents.length > 100 ||
      !parsed.documents.every(
        (doc) =>
          doc &&
          typeof doc.id === 'number' &&
          typeof doc.name === 'string' &&
          typeof doc.type === 'string' &&
          typeof doc.date === 'string' &&
          typeof doc.amount === 'string' &&
          typeof doc.reference === 'string' &&
          validStatuses.includes(doc.status) &&
          typeof doc.finding === 'string',
      ) ||
      typeof parsed.selectedId !== 'number'
    ) {
      return null
    }

    const documentTexts =
      parsed.documentTexts &&
      typeof parsed.documentTexts === 'object' &&
      !Array.isArray(parsed.documentTexts)
        ? parsed.documentTexts
        : {}

    const rawAnalyses =
      parsed.analyses &&
      typeof parsed.analyses === 'object' &&
      !Array.isArray(parsed.analyses)
        ? parsed.analyses
        : {}

    const analyses = Object.fromEntries(
      Object.entries(rawAnalyses).map(([id, analysis]) => [
        id,
        {
          ...analysis,
          analyzing: false,
          error: '',
        },
      ]),
    ) as Record<number, DocumentAnalysis>

    const rawWarnings =
      parsed.duplicateWarnings &&
      typeof parsed.duplicateWarnings === 'object' &&
      !Array.isArray(parsed.duplicateWarnings)
        ? parsed.duplicateWarnings
        : {}

    const previousUploads = Array.isArray(parsed.previousUploads)
      ? parsed.previousUploads
          .filter(
            (item) =>
              item &&
              typeof item.name === 'string' &&
              typeof item.text === 'string',
          )
          .slice(-20)
      : []

    const documents = parsed.documents
    const selectedId = documents.some(
      (doc) => doc.id === parsed.selectedId,
    )
      ? parsed.selectedId
      : documents[0]?.id ?? 1

    return {
      documents,
      selectedId,
      documentTexts: Object.fromEntries(
        Object.entries(documentTexts)
          .filter((entry): entry is [string, string] =>
            typeof entry[1] === 'string',
          )
          .map(([id, text]) => [id, text.slice(0, 20000)]),
      ),
      analyses,
      duplicateWarnings: rawWarnings as Record<number, string | null>,
      previousUploads,
    }
  } catch {
    return null
  }
}
function App() {
  const [savedState] = useState(() => loadPersistedState())
  const [documents, setDocuments] =
    useState<DocumentItem[]>(savedState?.documents ?? initialDocuments)
  const [selectedId, setSelectedId] =
    useState(savedState?.selectedId ?? 1)
  const [filter, setFilter] = useState('All documents')
  const [search, setSearch] = useState('')
  const [notice, setNotice] = useState('')
  const [documentTexts, setDocumentTexts] =
    useState<Record<number, string>>(savedState?.documentTexts ?? {})
  const [analyses, setAnalyses] =
    useState<Record<number, DocumentAnalysis>>(savedState?.analyses ?? {})
  const [duplicateWarnings, setDuplicateWarnings] =
    useState<Record<number, string | null>>(
      savedState?.duplicateWarnings ?? {},
    )

  const fileInput = useRef<HTMLInputElement>(null)
  const previousUploads = useRef<UploadedText[]>(
    savedState?.previousUploads ?? [],
  )

  useEffect(() => {
    try {
      const payload: PersistedAppState = {
        documents: documents.slice(0, 100),
        selectedId,
        documentTexts: Object.fromEntries(
          Object.entries(documentTexts).map(([id, text]) => [
            id,
            text.slice(0, 20000),
          ]),
        ),
        analyses: Object.fromEntries(
          Object.entries(analyses).map(([id, analysis]) => [
            id,
            { ...analysis, analyzing: false, error: '' },
          ]),
        ),
        duplicateWarnings,
        previousUploads: previousUploads.current
          .slice(-20)
          .map((item) => ({
            name: item.name,
            text: item.text.slice(0, 20000),
          })),
      }

      const serialized = JSON.stringify(payload)

     if (serialized.length > 1500000) {
  window.setTimeout(() => {
    setNotice(
      'Browser-local save skipped because the saved data exceeds the demo storage limit. Some recent changes may not survive refresh.',
    )
  }, 0)
  return
}

      window.localStorage.setItem(STORAGE_KEY, serialized)
    } catch {
  window.setTimeout(() => {
    setNotice(
      'Browser-local saving is unavailable or storage is full. Recent changes may not survive refresh.',
    )
  }, 0)
}
  }, [
    documents,
    selectedId,
    documentTexts,
    analyses,
    duplicateWarnings,
  ])

  const selectedDocument =
    documents.find((doc) => doc.id === selectedId) ?? documents[0]
  const selectedText = documentTexts[selectedId] ?? ''
  const selectedAnalysis = analyses[selectedId] ?? emptyAnalysis()
  const selectedDuplicateWarning = duplicateWarnings[selectedId] ?? null

  function updateAnalysis(id: number, update: Partial<DocumentAnalysis>) {
    setAnalyses((current) => ({
      ...current,
      [id]: { ...(current[id] ?? emptyAnalysis()), ...update },
    }))
  }

  async function analyzeDocument(id: number, textOverride?: string) {
    const text = textOverride ?? documentTexts[id] ?? ''

    if (!text.trim()) {
      updateAnalysis(id, {
        error: 'Paste document text or upload a .txt/.csv file before running the analysis.',
      })
      return
    }

    updateAnalysis(id, {
      analyzing: true,
      error: '',
      analysis: '',
      structured: null,
      structuredAvailable: false,
    })

    try {
      const response = await fetch('http://localhost:3001/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentText: text }),
      })

      const result = (await response.json()) as {
        analysis?: string
        error?: string
        structuredAnalysisAvailable?: boolean
        reviewStatus?: string
        summary?: string
        riskIndicators?: RiskIndicator[]
        evidence?: EvidenceItem[]
        recommendedActions?: string[]
      }

      if (!response.ok) {
        throw new Error(result.error || 'Analysis request failed.')
      }

      if (!result.analysis) {
        throw new Error('The AI returned no analysis.')
      }

      let structured: StructuredAnalysis | null = null

      if (
        result.structuredAnalysisAvailable === true &&
        typeof result.reviewStatus === 'string' &&
        typeof result.summary === 'string' &&
        Array.isArray(result.riskIndicators) &&
        Array.isArray(result.evidence) &&
        Array.isArray(result.recommendedActions)
      ) {
        structured = {
          reviewStatus: result.reviewStatus,
          summary: result.summary,
          riskIndicators: result.riskIndicators,
          evidence: result.evidence,
          recommendedActions: result.recommendedActions,
        }
      }

      updateAnalysis(id, {
        analysis: result.analysis,
        structured,
        structuredAvailable: structured !== null,
      })
    } catch (error) {
      const message =
        error instanceof TypeError
          ? 'Unable to reach ClearDesk AI. Check that the backend is running, then try again.'
          : error instanceof Error
            ? error.message
            : 'Something went wrong while analyzing the document. Please try again.'

      updateAnalysis(id, { error: message })
    } finally {
      updateAnalysis(id, { analyzing: false })
    }
  }
    async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''

    if (!files.length) return

    const uploadedAt = Date.now()

    const added: DocumentItem[] = files.map((file, index) => ({
      id: uploadedAt + index,
      name: file.name,
      type: file.name.toLowerCase().endsWith('.pdf')
        ? 'PDF document'
        : file.name.toLowerCase().endsWith('.csv')
          ? 'CSV document'
          : file.name.toLowerCase().endsWith('.txt')
            ? 'Text document'
            : 'Uploaded document',
      date: new Date().toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }),
      amount: 'Not extracted',
      reference: `UPLOAD-${uploadedAt.toString().slice(-6)}-${index + 1}`,
      status: 'Needs review',
      finding:
        'File added to the review queue. Text files (.txt and .csv) can be read and analyzed automatically. PDF and image text extraction is not connected yet.',
    }))

    setDocuments((current) => [...added, ...current])
    setSelectedId(added[0].id)
    setFilter('All documents')

    const textFiles = files
      .map((file, index) => ({ file, doc: added[index] }))
      .filter(({ file }) => /\.(txt|csv)$/i.test(file.name))

    if (!textFiles.length) {
      setNotice(
        `${files.length} file${files.length === 1 ? '' : 's'} added to the queue. Automatic text extraction supports .txt and .csv only; PDFs and images are queued but not extracted.`,
      )
      return
    }

    setNotice(`Processing ${textFiles.length} text file${textFiles.length === 1 ? '' : 's'}.`)

    const messages: string[] = []

    for (const { file, doc } of textFiles) {
      try {
        const contents = (await file.text()).slice(0, 20000)

        if (!contents.trim()) {
          messages.push(`${file.name} is empty.`)
          continue
        }

        const duplicate = findExactDuplicate(contents, previousUploads.current)

        previousUploads.current = [
          ...previousUploads.current,
          { name: file.name, text: contents },
        ]

        setDocumentTexts((current) => ({
          ...current,
          [doc.id]: contents,
        }))

        setDuplicateWarnings((current) => ({
          ...current,
          [doc.id]: duplicate,
        }))

        messages.push(
          duplicate
            ? `${file.name}: potential duplicate detected.`
            : `${file.name}: uploaded and analyzed.`,
        )

        await analyzeDocument(doc.id, contents)
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown upload error.'

        updateAnalysis(doc.id, { error: message })
        messages.push(`${file.name}: ${message}`)
      }
    }

    setNotice(messages.join(' '))
  }

  function markReviewed() {
    if (!selectedDocument) return

    setDocuments((current) =>
      current.map((doc) =>
        doc.id === selectedDocument.id
          ? { ...doc, status: 'Reviewed' }
          : doc,
      ),
    )

    setNotice(
      'Marked as reviewed in this demo. No financial decision or payment was made.',
    )
  }

  const filteredDocuments = documents.filter((doc) => {
    const matchesFilter =
      filter === 'All documents' ||
      (filter === 'Needs review' && doc.status === 'Needs review') ||
      (filter === 'Flagged' && doc.status === 'Flagged') ||
      (filter === 'Reviewed' && doc.status === 'Reviewed')

    const query = search.toLowerCase()

    return (
      matchesFilter &&
      (doc.name.toLowerCase().includes(query) ||
        doc.reference.toLowerCase().includes(query))
    )
  })

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#dashboard" aria-label="ClearDesk AI home">
          <span className="brand-mark">C</span>
          <span>
            <strong>ClearDesk</strong>
            <small>AI WORKSPACE</small>
          </span>
        </a>

        <div className="workspace-label">WORKSPACE</div>

        <nav className="navigation" aria-label="Main navigation">
          <a className="nav-item active" href="#dashboard">
            <span className="nav-icon">▦</span> Overview
          </a>
          <a
            className="nav-item"
            href="#documents"
            onClick={() => setFilter('All documents')}
          >
            <span className="nav-icon">▤</span> Documents
            <span className="nav-count">{documents.length}</span>
          </a>
          <a className="nav-item" href="#findings">
            <span className="nav-icon">⚑</span> Findings
          </a>
        </nav>

        <div className="sidebar-bottom">
          <div className="sidebar-status">
            <span className="status-dot" />
            <span>
              <strong>Human-in-control</strong>
              <small>Review before action</small>
            </span>
          </div>
          <p>ClearDesk AI · Prototype</p>
        </div>
      </aside>

      <main className="main-content" id="dashboard">
        <div className="page-container">
          <header className="topbar">
            <div>
              <div className="eyebrow">WORKSPACE / OVERVIEW</div>
              <h1>Document review dashboard</h1>
              <p>Spot discrepancies. Verify evidence. Keep people in control.</p>
            </div>
            <div className="topbar-badge">
              <span className="status-dot" /> Demo environment
            </div>
          </header>

          <section className="upload-panel" aria-label="Upload documents">
            <div className="upload-copy">
              <div className="upload-icon">↑</div>
              <div>
                <h2>Add documents to your queue</h2>
                <p>
                  Upload text or CSV files for analysis. PDF and image files
                  can be queued, but their text is not extracted yet.
                </p>
              </div>
            </div>
            <button
              type="button"
              className="upload-button"
              onClick={() => fileInput.current?.click()}
            >
              + Upload documents
            </button>
            <input
              ref={fileInput}
              className="hidden-file-input"
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.csv"
              multiple
              onChange={handleUpload}
            />
          </section>

          <div className="prototype-notice">
            <span className="notice-icon">i</span>
            <div>
              <strong>Prototype workspace</strong>
              <span>
                Uploads add files to the queue. .txt and .csv files are read
                and sent to Meta AI automatically. PDF and image text extraction
                is not connected yet.
              </span>
            </div>
          </div>

          {notice && (
            <div className="action-notice" role="status">
              <span>{notice}</span>
              <button
                type="button"
                aria-label="Dismiss notification"
                onClick={() => setNotice('')}
              >
                ×
              </button>
            </div>
          )}

          <section className="stats-grid" aria-label="Document summary">
            {[
              {
                label: 'Total documents',
                value: documents.length,
                icon: '▤',
                tone: 'blue',
                caption: 'In your review workspace',
              },
              {
                label: 'Needs review',
                value: documents.filter((d) => d.status === 'Needs review').length,
                icon: '◷',
                tone: 'amber',
                caption: 'Awaiting human verification',
              },
              {
                label: 'Flagged items',
                value: documents.filter((d) => d.status === 'Flagged').length,
                icon: '⚑',
                tone: 'red',
                caption: 'Potential discrepancies',
              },
              {
                label: 'Reviewed',
                value: documents.filter((d) => d.status === 'Reviewed').length,
                icon: '✓',
                tone: 'green',
                caption: 'Marked reviewed in this demo',
              },
            ].map((stat) => (
              <article className="stat-card" key={stat.label}>
                <div className="stat-top">
                  <span>{stat.label}</span>
                  <span className={`stat-icon ${stat.tone}`}>{stat.icon}</span>
                </div>
                <div className="stat-number">{stat.value}</div>
                <div className="stat-caption">{stat.caption}</div>
              </article>
            ))}
          </section>

          <section className="workspace-grid">
            <div className="panel document-panel" id="documents">
              <div className="panel-heading">
                <div>
                  <h2>Document review queue</h2>
                  <p>Find the paperwork that needs your attention.</p>
                </div>
                <span className="queue-total">{documents.length} items</span>
              </div>

              <div className="search-box">
                <span>⌕</span>
                <input
                  aria-label="Search documents"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search by filename or reference..."
                />
              </div>

              <div className="filter-row" aria-label="Filter documents">
                {['All documents', 'Needs review', 'Flagged', 'Reviewed'].map(
                  (item) => (
                    <button
                      key={item}
                      type="button"
                      className={`filter-chip ${filter === item ? 'selected' : ''}`}
                      onClick={() => setFilter(item)}
                    >
                      {item}
                    </button>
                  ),
                )}
              </div>

              <div className="document-list">
                {filteredDocuments.map((doc) => (
                  <button
                    type="button"
                    key={doc.id}
                    className={`document-row ${selectedId === doc.id ? 'selected-document' : ''}`}
                    onClick={() => setSelectedId(doc.id)}
                  >
                    <span className="file-icon">
                      {doc.type.toLowerCase().includes('pdf') ? 'PDF' : 'TXT'}
                    </span>
                    <span className="document-main">
                      <strong>{doc.name}</strong>
                      <span>{doc.type} · {doc.date}</span>
                    </span>
                    <span
                      className={`status-pill ${doc.status.toLowerCase().replace(' ', '-')}`}
                    >
                      {doc.status}
                    </span>
                  </button>
                ))}

                {filteredDocuments.length === 0 && (
                  <div className="empty-state">
                    <span>⌕</span>
                    <strong>No matching documents</strong>
                    <p>Try another search or filter.</p>
                  </div>
                )}
              </div>

              <div className="panel-footer">
                <span>Illustrative sample records</span>
                <span className="footer-lock">◇ Human review required</span>
              </div>
            </div>
                        <div className="panel detail-panel" id="findings">
              {selectedDocument ? (
                <>
                  <div className="panel-heading detail-heading">
                    <div>
                      <div className="eyebrow">SELECTED DOCUMENT</div>
                      <h2>Review details</h2>
                    </div>
                    <span className="detail-dots">···</span>
                  </div>

                  <div className="selected-file">
                    <div className="large-file-icon">
                      {selectedDocument.type.toLowerCase().includes('pdf')
                        ? 'PDF'
                        : 'TXT'}
                    </div>
                    <div className="selected-file-info">
                      <strong>{selectedDocument.name}</strong>
                      <span>{selectedDocument.type}</span>
                    </div>
                  </div>

                  <div className="detail-divider" />
                  <div className="detail-label">DOCUMENT INFORMATION</div>

                  <div className="detail-fields">
                    <div>
                      <span>Reference</span>
                      <strong>{selectedDocument.reference}</strong>
                    </div>
                    <div>
                      <span>Document date</span>
                      <strong>{selectedDocument.date}</strong>
                    </div>
                    <div>
                      <span>Amount</span>
                      <strong>{selectedDocument.amount}</strong>
                    </div>
                    <div>
                      <span>Review status</span>
                      <strong
                        className={`status-text ${selectedDocument.status.toLowerCase().replace(' ', '-')}`}
                      >
                        {selectedDocument.status}
                      </strong>
                    </div>
                  </div>

                  <div className="finding-card">
                    <div className="finding-heading">
                      <span className="finding-symbol">!</span>
                      <strong>Review note</strong>
                    </div>
                    <p>{selectedDocument.finding}</p>
                    <span className="finding-source">
                      <span className="source-dot" />
                      Sample note · Not AI-generated
                    </span>
                  </div>

                  {selectedDuplicateWarning && (
                    <div className="finding-card" role="alert">
                      <div className="finding-heading">
                        <span className="finding-symbol">!</span>
                        <strong>Potential duplicate detected</strong>
                      </div>
                      <p>{selectedDuplicateWarning}</p>
                      <span className="finding-source">
                        <span className="source-dot" />
                        Exact text comparison · Human verification required
                      </span>
                    </div>
                  )}

                  <div className="ai-analysis-card">
                    <div className="finding-heading">
                      <span className="finding-symbol">AI</span>
                      <strong>Meta AI verification</strong>
                    </div>
                    <p>
                      Paste text from the selected document. The AI will
                      review the supplied text for missing details and
                      potential inconsistencies.
                    </p>

                    <textarea
                      className="ai-analysis-input"
                      aria-label="Document text to analyze"
                      placeholder="Paste invoice, receipt, or payment confirmation text here..."
                      value={selectedText}
                      onChange={(event) =>
                        setDocumentTexts((current) => ({
                          ...current,
                          [selectedId]: event.target.value,
                        }))
                      }
                      rows={6}
                      maxLength={20000}
                    />

                    <button
                      type="button"
                      className="review-button"
                      onClick={() => analyzeDocument(selectedId)}
                      disabled={
                        selectedAnalysis.analyzing || !selectedText.trim()
                      }
                    >
                      {selectedAnalysis.analyzing
                        ? 'Analyzing with Meta AI...'
                        : 'Analyze with Meta AI'}
                    </button>

                    {selectedAnalysis.error && (
                      <p className="ai-analysis-error" role="alert">
                        {selectedAnalysis.error}
                      </p>
                    )}

                    {selectedAnalysis.analysis && (
                      <div className="ai-analysis-result" aria-live="polite">
                        <strong>AI findings</strong>

                        {selectedAnalysis.structuredAvailable &&
                        selectedAnalysis.structured ? (
                          <div className="structured-analysis">
                            <section className="structured-section">
                              <div className="structured-section-heading">
                                <h3>Review status</h3>
                                <span
                                  className={`review-status-badge ${
                                    selectedAnalysis.structured.reviewStatus ===
                                    'Flagged'
                                      ? 'status-flagged'
                                      : selectedAnalysis.structured
                                            .reviewStatus ===
                                          'Reviewed - no issues identified'
                                        ? 'status-reviewed'
                                        : 'status-needs-review'
                                  }`}
                                >
                                  {selectedAnalysis.structured.reviewStatus}
                                </span>
                              </div>
                              <p>{selectedAnalysis.structured.summary}</p>
                            </section>

                            <section className="structured-section">
                              <h3>Risk indicators</h3>
                              {selectedAnalysis.structured.riskIndicators
                                .length ? (
                                <div className="risk-indicator-list">
                                  {selectedAnalysis.structured.riskIndicators.map(
                                    (risk, index) => (
                                      <article
                                        className="risk-indicator-card"
                                        key={`${risk.title}-${index}`}
                                      >
                                        <div className="risk-indicator-heading">
                                          <strong>{risk.title}</strong>
                                          <span
                                            className={`severity-badge severity-${risk.severity.toLowerCase()}`}
                                          >
                                            {risk.severity}
                                          </span>
                                        </div>
                                        <p>{risk.explanation}</p>
                                        <p className="evidence-detail">
                                          <strong>Evidence:</strong>{' '}
                                          {risk.evidence}
                                        </p>
                                      </article>
                                    ),
                                  )}
                                </div>
                              ) : (
                                <p>No specific risk indicators were returned.</p>
                              )}
                            </section>

                            <section className="structured-section">
                              <h3>Evidence</h3>
                              {selectedAnalysis.structured.evidence.length ? (
                                <div className="evidence-list">
                                  {selectedAnalysis.structured.evidence.map(
                                    (item, index) => (
                                      <div
                                        className="evidence-row"
                                        key={`${item.field}-${index}`}
                                      >
                                        <div>
                                          <strong>{item.field}</strong>
                                          <p>{item.value}</p>
                                        </div>
                                        <span
                                          className={`evidence-assessment assessment-${item.assessment.toLowerCase()}`}
                                        >
                                          {item.assessment}
                                        </span>
                                      </div>
                                    ),
                                  )}
                                </div>
                              ) : (
                                <p>No individual evidence items were returned.</p>
                              )}
                            </section>

                            <section className="structured-section">
                              <h3>Recommended actions</h3>
                              {selectedAnalysis.structured.recommendedActions
                                .length ? (
                                <ol className="recommended-actions-list">
                                  {selectedAnalysis.structured.recommendedActions.map(
                                    (action, index) => (
                                      <li key={`${index}-${action}`}>
                                        {action}
                                      </li>
                                    ),
                                  )}
                                </ol>
                              ) : (
                                <p>Refer the document for human review.</p>
                              )}
                            </section>
                          </div>
                        ) : (
                          <pre>{selectedAnalysis.analysis}</pre>
                        )}

                        <p>
                          AI-generated findings are advisory. Verify them
                          against the original document and supporting records.
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="human-review">
                    <span className="human-icon">✓</span>
                    <div>
                      <strong>Human verification</strong>
                      <p>
                        Check the original document and supporting records
                        before making a financial decision.
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="review-button"
                    onClick={markReviewed}
                    disabled={selectedDocument.status === 'Reviewed'}
                  >
                    {selectedDocument.status === 'Reviewed'
                      ? '✓ Marked as reviewed'
                      : 'Mark as reviewed'}
                  </button>

                  <p className="detail-disclaimer">
                    This action only updates the local demo interface. It
                    does not approve, send, or change a payment.
                  </p>
                </>
              ) : (
                <div className="empty-state">
                  <strong>Select a document</strong>
                  <p>Choose an item from the queue to see its details.</p>
                </div>
              )}
            </div>
          </section>

          <footer className="page-footer">
            <span>ClearDesk AI · Document review workspace</span>
            <span>Built for accountable decisions</span>
          </footer>
        </div>
      </main>
    </div>
  )
}

export default App