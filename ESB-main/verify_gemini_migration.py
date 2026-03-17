import os
import sys
import re

def verify_migration():
    print("🔍 Starting Gemini Migration Verification...")
    
    root_dir = os.path.dirname(os.path.abspath(__file__))
    app_dir = os.path.join(root_dir, 'app')
    
    errors = []
    warnings = []
    
    # 1. Static Code Analysis: Look for 'groq' references
    print("\n[1/3] Scanning codebase for 'groq' references...")
    allowed_mentions = [
        'rename groq_api_key to google_api_key', # Migration message
        'groq_api_key', # Old column name in migration files is okay usually, but we want to ensure it's not active code
        'verify_gemini_migration.py' # This file
    ]
    
    # Files to ignore (e.g. this script, migrations folder might list old columns)
    ignored_patterns = [
        r'verify_gemini_migration\.py',
        r'migrations\\', 
        r'\.git\\',
        r'__pycache__',
        r'\.env'
    ]
    
    found_groq = False
    for root, dirs, files in os.walk(root_dir):
        # Skip disregarded directories
        if 'migrations' in root or '.git' in root or '__pycache__' in root or 'venv' in root:
            continue
            
        for file in files:
            if file == 'verify_gemini_migration.py':
                continue
                
            file_path = os.path.join(root, file)
            
            # Skip non-text files
            if not file.endswith(('.py', '.html', '.js', '.md', '.txt')):
                continue
                
            try:
                with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                    content = f.read()
                    
                # Case insensitive search for groq
                # We specifically look for imports or API usages
                if 'groq' in content.lower():
                    # Check if it's a real issue or just a comment/migration note
                    lines = content.splitlines()
                    for i, line in enumerate(lines):
                        if 'groq' in line.lower():
                            # Simple filter for the specific migration file or comments we might accept
                            is_ignored = False
                            for pattern in ignored_patterns:
                                if re.search(pattern, file_path):
                                    is_ignored = True
                            
                            if not is_ignored:
                                # Highlight specific dangerous usages
                                if "from groq import" in line or "import groq" in line:
                                    errors.append(f"CRITICAL: Found Groq Import in {file_path}:{i+1} -> {line.strip()}")
                                    found_groq = True
                                elif "Groq(" in line:
                                    errors.append(f"CRITICAL: Found Groq Client Instantiation in {file_path}:{i+1} -> {line.strip()}")
                                    found_groq = True
                                elif "groq_api_key" in line and not "google_api_key" in line:
                                    # Might be old variable name reference
                                    warnings.append(f"WARNING: Found 'groq_api_key' in {file_path}:{i+1} -> {line.strip()}")
                                else:
                                    # Just string mention
                                    warnings.append(f"INFO: Found 'groq' string in {file_path}:{i+1} -> {line.strip()}")

            except Exception as e:
                pass

    if not found_groq:
        print("✅ No active Groq imports or client instantiations found.")
    else:
        print("❌ Groq references found!")

    # 2. Check Configuration
    print("\n[2/3] Verifying Configuration...")
    config_path = os.path.join(app_dir, 'config.py')
    try:
        with open(config_path, 'r', encoding='utf-8') as f:
            config_content = f.read()
            
        if 'GOOGLE_API_KEY' in config_content:
            print("✅ 'GOOGLE_API_KEY' found in config.py")
        else:
            errors.append("❌ 'GOOGLE_API_KEY' NOT found in config.py")
            
        if 'GEMINI_MODEL' in config_content:
            print("✅ 'GEMINI_MODEL' found in config.py")
        else:
            warnings.append("⚠️ 'GEMINI_MODEL' NOT found in config.py (Might be using default hardcoded)")
            
    except Exception as e:
        errors.append(f"Could not read config.py: {e}")

    # 3. Environment Check
    print("\n[3/3] Checking Dependencies (Simulation)...")
    try:
        import langchain_google_genai
        print("✅ langchain-google-genai is installed.")
    except ImportError:
        errors.append("❌ langchain-google-genai is NOT installed. Run: pip install langchain-google-genai")

    print("\n" + "="*50)
    print("VERIFICATION SUMMARY")
    print("="*50)
    
    if errors:
        print("\n❌ ERRORS (Must Fix):")
        for err in errors:
            print(f" - {err}")
    else:
        print("\n✅ NO CRITICAL ERRORS FOUND.")
        
    if warnings:
        print("\n⚠️ WARNINGS (Review if needed):")
        for warn in warnings:
            print(f" - {warn}")
            
    if not errors:
        print("\n🚀 system appears ready for Gemini usage (assuming DB migration is run).")
        sys.exit(0)
    else:
        print("\n⛔ System needs verification.")
        sys.exit(1)

if __name__ == "__main__":
    verify_migration()
