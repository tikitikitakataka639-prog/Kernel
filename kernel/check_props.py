import re
import os

def find_duplicate_props(file_path):
    with open(file_path, 'r') as f:
        content = f.read()
    
    # Very simple regex to find JSX tags and their attributes
    # This is not perfect for nested structures but good for finding duplicates in a single tag
    tags = re.findall(r'<[a-zA-Z0-9_]+(\s+[a-zA-Z0-9_-]+(?:=\{?[^}]*\}?|(?=\s|>|/)))*\s*/?>', content)
    
    for tag in tags:
        # Extract attributes
        attrs = re.findall(r'([a-zA-Z0-9_-]+)(?:=\{?[^}]*\}?|(?=\s|>|/))', tag)
        seen = set()
        for attr in attrs:
            if attr in seen:
                print(f"Duplicate prop '{attr}' found in {file_path}")
            seen.add(attr)

files = ['src/routes/analisis.tsx', 'src/routes/index.tsx', 'src/routes/chat.tsx', 'src/routes/chat.index.tsx', 'src/routes/chat.$threadId.tsx', 'src/routes/__root.tsx']
for file in files:
    if os.path.exists(file):
        find_duplicate_props(file)
