# Exam Preparation — Agent & Skills Flow

## Complete Pipeline

```mermaid
graph TD
    subgraph "📤 Upload Phase"
        A[Upload Exam PDF] --> B[Extract Text]
        B --> C[Extract Questions]
    end

    subgraph "🏷️ Auto-Classification Phase"
        C --> D[Classify Bloom]
        C --> E[Classify AA]
        C --> F[Assess Difficulty]
        D --> G[Tag Sync]
        E --> G
        F --> G
    end

    subgraph "📊 Analysis Phase"
        G --> H[Compare Module vs Exam]
        H --> I[Generate Feedback]
        I --> J[Suggest Adjustments]
    end

    subgraph "✍️ Correction Phase"
        G --> K[Generate Corrections]
        K --> L[Validate Corrections]
    end

    subgraph "📄 Generation Phase"
        J --> M[Generate LaTeX]
        M --> N[Compile PDF]
        N --> O[Evaluate Proposal]
    end

    subgraph "🔄 Sync"
        O -.->|sync| K
        L -.->|update tags| G
    end

    style A fill:#f59e0b,color:#fff
    style G fill:#6366f1,color:#fff
    style K fill:#10b981,color:#fff
    style O fill:#8b5cf6,color:#fff
```

## Agent Nodes & Skills Used

| Node | Agent Type | LLM Model | Skills Used |
|------|-----------|-----------|-------------|
| Extract Text | Deterministic | — | — |
| Extract Questions | Deterministic | gemini-2.5-pro | — |
| Classify Bloom | ReAct Agent | gemini-2.5-pro | bloom-classifier |
| Classify AA | ReAct Agent | gemini-2.5-pro | syllabus-mapper |
| Assess Difficulty | Deterministic | gemini-2.5-pro | — |
| Compare Module vs Exam | Deterministic | gemini-2.5-pro | — |
| Generate Feedback | ReAct Agent | gemini-2.5-pro | feedback-writer |
| Suggest Adjustments | ReAct Agent | gemini-2.5-pro | — |
| Generate Corrections | ReAct Agent | gemini-2.5-pro | rubric-builder |
| Generate LaTeX | Deterministic | gemini-2.5-pro | — |
| Evaluate Proposal | Deterministic | gemini-2.5-pro | — |
| Tag Sync | MCP Tool | gemini-2.5-pro | bloom-classifier, syllabus-mapper |
| Correct Student | MCP Tool | gemini-2.5-pro | feedback-writer |

## Interaction Diagram

```mermaid
sequenceDiagram
    participant T as Teacher
    participant FE as Frontend
    participant API as Flask API
    participant AG as Exam Agent Graph
    participant MCP as MCP Tools
    participant SK as Skills
    participant LLM as Gemini Pro

    T->>FE: Upload exam PDF
    FE->>API: POST /upload
    FE->>API: POST /extract-questions
    API->>LLM: Extract with Vision
    LLM-->>API: Questions JSON
    API-->>FE: Extracted questions

    Note over FE: Auto-classification triggered
    FE->>API: POST /auto-classify
    API->>MCP: classify_questions_bloom()
    MCP->>SK: bloom-classifier skill
    SK->>LLM: Classify
    LLM-->>SK: Bloom levels
    API->>MCP: classify_questions_aa()
    MCP->>SK: syllabus-mapper skill
    SK->>LLM: Map AA codes
    LLM-->>SK: AA assignments
    API-->>FE: Classified questions

    T->>FE: Validate questions (batch)
    FE->>API: POST /generate-correction
    API->>MCP: generate_question_correction()
    MCP->>LLM: Generate model answers
    LLM-->>MCP: Corrections
    API-->>FE: Corrections generated

    T->>FE: Launch full analysis
    FE->>API: POST /analyze
    API->>AG: run_exam_evaluation()
    AG->>MCP: 11 nodes pipeline
    AG-->>API: Complete analysis
    API-->>FE: Dashboard data
```
