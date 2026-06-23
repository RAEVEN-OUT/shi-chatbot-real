'use client';
import { useEffect } from "react";

function ChatWidget() {
  useEffect(() => {
    window.CHATBOT_CONFIG = {
      apiKey: "A9lDmhJ4s0zPHqkwMvVh",
    };

    let apiUrl = process.env.NEXT_PUBLIC_WITHOUT_API_URL || process.env.NEXT_PUBLIC_API_URL?.replace(/\/api$/, '');
    if (!apiUrl || apiUrl.trim() === '' || apiUrl.includes('localhost') || apiUrl.includes('127.0.0.1')) {
      apiUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8005';
    } else {
      apiUrl = apiUrl.trim();
    }
    const script = document.createElement("script");
    script.src = `${apiUrl}/public/widget/widget.min.js`;
    script.async = true;

    document.body.appendChild(script);

    return () => {
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
    };
  }, []);

  return null;
}

export default ChatWidget;