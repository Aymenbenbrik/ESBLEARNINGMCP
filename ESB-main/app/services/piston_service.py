"""
Piston Code Execution Service
==============================
Wraps the Piston API (https://emkc.org/api/v2/piston) for sandboxed code execution.
Integrates the logic from server_evaluation.py into the main Flask app.
"""
import logging
import requests

logger = logging.getLogger(__name__)

PISTON_API_URL = "https://emkc.org/api/v2/piston/execute"

# Known Piston language → version mapping
LANGUAGE_VERSIONS = {
    'python':     '3.10.0',
    'javascript': '18.15.0',
    'typescript': '5.0.3',
    'java':       '15.0.2',
    'c':          '10.2.0',
    'cpp':        '10.2.0',
    'c++':        '10.2.0',
    'csharp':     '6.12.0',
    'ruby':       '3.0.1',
    'go':         '1.16.2',
    'rust':       '1.50.0',
    'php':        '8.0.2',
    'kotlin':     '1.8.20',
    'swift':      '5.3.3',
    'r':          '4.1.1',
    'bash':       '5.2.0',
    'sql':        '3.36.0',
}

LANGUAGE_FILENAMES = {
    'python':     'main.py',
    'javascript': 'main.js',
    'typescript': 'main.ts',
    'java':       'Main.java',
    'c':          'main.c',
    'cpp':        'main.cpp',
    'c++':        'main.cpp',
    'csharp':     'main.cs',
    'ruby':       'main.rb',
    'go':         'main.go',
    'rust':       'main.rs',
    'php':        'main.php',
    'kotlin':     'main.kt',
    'swift':      'main.swift',
    'r':          'main.r',
    'bash':       'main.sh',
    'sql':        'main.sql',
}


def execute_code(language: str, code: str, stdin: str = '', timeout_ms: int = 5000) -> dict:
    """
    Execute code on the Piston sandbox.

    Returns dict:
      {
        'success': bool,
        'stdout':  str,
        'stderr':  str,
        'exit_code': int,
        'error':   str | None   # set if Piston call itself failed
      }
    """
    lang = language.lower().strip()
    version = LANGUAGE_VERSIONS.get(lang, '*')
    filename = LANGUAGE_FILENAMES.get(lang, 'main.txt')

    payload = {
        'language': lang if lang != 'c++' else 'cpp',
        'version':  version,
        'files':    [{'name': filename, 'content': code}],
        'stdin':    stdin,
        'compile_timeout': 10000,
        'run_timeout':     timeout_ms,
    }

    try:
        resp = requests.post(PISTON_API_URL, json=payload, timeout=20)
        if resp.status_code != 200:
            return {'success': False, 'stdout': '', 'stderr': '',
                    'exit_code': -1, 'error': f'Piston HTTP {resp.status_code}'}

        data = resp.json()
        run = data.get('run', {})
        compile_ = data.get('compile', {})

        stdout = run.get('stdout', '').strip()
        stderr = (compile_.get('stderr', '') + run.get('stderr', '')).strip()
        exit_code = run.get('code', 0) or 0

        return {
            'success': exit_code == 0 and not stderr,
            'stdout':  stdout,
            'stderr':  stderr,
            'exit_code': exit_code,
            'error': None,
        }

    except requests.Timeout:
        return {'success': False, 'stdout': '', 'stderr': '',
                'exit_code': -1, 'error': 'Timeout — code took too long to execute'}
    except Exception as exc:
        logger.error(f'Piston call failed: {exc}')
        return {'success': False, 'stdout': '', 'stderr': '',
                'exit_code': -1, 'error': str(exc)}


def execute_with_tests(language: str, student_code: str, test_cases: str) -> dict:
    """
    Append hidden test_cases to student code and execute.
    Returns execution result + a 'passed' boolean.
    The test_cases should print 'TESTS_PASSED' on success and raise/print errors otherwise.
    """
    combined = student_code + '\n\n# --- hidden tests ---\n' + test_cases
    result = execute_code(language, combined)
    result['passed'] = 'TESTS_PASSED' in result.get('stdout', '')
    return result
