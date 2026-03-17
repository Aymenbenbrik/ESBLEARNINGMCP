osb_platform/
│
├── app/
│   ├── __init__.py           # Flask app initialization
│   ├── config.py             # Configuration settings
│   ├── models.py             # Database models
│   ├── routes/
│   │   ├── __init__.py
│   │   ├── auth.py           # Authentication routes
│   │   ├── courses.py        # Course management routes
│   │   ├── chapters.py       # Chapter management routes
│   │   └── ai.py             # AI integration routes
│   │
│   ├── services/
│   │   ├── __init__.py
│   │   ├── file_service.py   # File handling service
│   │   └── ai_service.py     # AI integration service
│   │
│   ├── static/
│   │   ├── css/
│   │   │   └── main.css      # Main stylesheet
│   │   ├── js/
│   │   │   └── main.js       # Main JavaScript file
│   │   └── img/              # Images
│   │
│   └── templates/
│       ├── base.html         # Base template
│       ├── auth/
│       │   ├── login.html
│       │   └── register.html
│       ├── courses/
│       │   ├── index.html
│       │   ├── create.html
│       │   └── view.html
│       ├── chapters/
│       │   ├── create.html
│       │   └── view.html
│       └── ai/
│           └── chat.html     # AI chatbot interface
│
├── migrations/               # Database migrations
├── uploads/                  # Uploaded files
├── .env                      # Environment variables
├── .gitignore                # Git ignore file
├── requirements.txt          # Project dependencies
└── run.py                    # Application entry point