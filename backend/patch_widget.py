import os

def patch_widget():
    filepath = r"d:\Projects\shi-chatbot-real\backend\public\widget\widget.min.js"
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    # Find the session exists check and reset message count
    target1 = 'e&&e.session_exists||(W("chatbot_session_id"),j("chatbot_session_id",d="sess_"+Math.random().toString(36).substring(2,9)))'
    replacement1 = 'e&&e.session_exists||(W("chatbot_session_id"),j("chatbot_session_id",d="sess_"+Math.random().toString(36).substring(2,9)),R("chatbot_msg_count","0"),u=0)'
    
    if target1 in content:
        content = content.replace(target1, replacement1)
        print("Patched target1: Session reset logic updated.")
    else:
        print("target1 not found")

    # Find the restore-no check
    target2 = 'W("chatbot_history_token"),W("chatbot_local_session_id"),W("chatbot_local_messages")'
    replacement2 = 'W("chatbot_history_token"),W("chatbot_local_session_id"),W("chatbot_local_messages"),R("chatbot_msg_count","0"),u=0'
    
    if target2 in content:
        content = content.replace(target2, replacement2)
        print("Patched target2: restore-no reset logic updated.")
    else:
        print("target2 not found")
        
    # Find the error reset
    target3 = 'e&&e.session_exists||(W("chatbot_session_id"),j("chatbot_session_id",d="sess_"+Math.random().toString(36).substring(2,9)),Y(i.welcome_message,"bot"),te(),K("ai"))'
    replacement3 = 'e&&e.session_exists||(W("chatbot_session_id"),j("chatbot_session_id",d="sess_"+Math.random().toString(36).substring(2,9)),R("chatbot_msg_count","0"),u=0,Y(i.welcome_message,"bot"),te(),K("ai"))'
    
    # Actually wait, target1 replacement might already cover target3 if target3 contains target1.
    
    # Save the file
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(content)
        
if __name__ == "__main__":
    patch_widget()
