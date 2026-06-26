with open('d:/Projects/shi-chatbot-real/backend/routers/widget_routes.py', 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
in_try_block = False
for i, line in enumerate(lines):
    if 'await websocket.send_json({"type": "typing"})' in line and not in_try_block:
        new_lines.append(line)
        new_lines.append('            try:\n')
        in_try_block = True
    elif in_try_block and 'except WebSocketDisconnect:' in line:
        new_lines.append('            except Exception as loop_err:\n')
        new_lines.append('                logger.error(f"Unexpected error processing message: {loop_err}")\n')
        new_lines.append('                await websocket.send_json({"type": "error", "text": "An unexpected error occurred. Please try again."})\n\n')
        new_lines.append(line)
        in_try_block = False
    elif in_try_block:
        new_lines.append('    ' + line if line.strip() else line)
    else:
        new_lines.append(line)

with open('d:/Projects/shi-chatbot-real/backend/routers/widget_routes.py', 'w', encoding='utf-8') as f:
    f.writelines(new_lines)
