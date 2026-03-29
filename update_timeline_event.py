import re

with open('src/panels/TaskDetail/index.tsx', 'r') as f:
    content = f.read()

# Replace the component definition with React.memo
old_definition = "function TimelineEvent({"
new_definition = "const TimelineEvent = React.memo(function TimelineEvent({"

content = content.replace(old_definition, new_definition)

# Add import React at top if missing, but React.memo can also just be imported
if "import React" not in content and "React.memo" in new_definition:
    if "import { useEffect" in content:
        content = content.replace("import { useEffect", "import React, { useEffect")

# Close the React.memo around the function
# The function ends with a closing brace `}` right before `\n` at EOF
content = re.sub(r'(\}\n*)$', r'})\n', content)

with open('src/panels/TaskDetail/index.tsx', 'w') as f:
    f.write(content)
