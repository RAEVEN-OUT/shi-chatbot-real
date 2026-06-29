'use client';
import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/utils/api';
import { Send, User, MessageCircle } from 'lucide-react';
import { formatDate, formatTime } from '@/utils/dateFormatter';
import { auth } from '@/firebase/config';

export default function SupportChat() {
  const { userData, currentUser } = useAuth();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [ws, setWs] = useState(null);
  const messagesEndRef = useRef(null);

  const activeUid = userData?.uid || currentUser?.uid;

  useEffect(() => {
    if (!activeUid) return;

    // Fetch history
    const fetchHistory = async () => {
      try {
        const res = await api.get(`/support-chats/${activeUid}`);
        if (res.data && res.data.messages) {
          setMessages(res.data.messages);
        }
      } catch (err) {
        console.error('Failed to load chat history:', err);
      }
    };
    fetchHistory();

    const connectWs = async () => {
      const baseUrl = (process.env.NEXT_PUBLIC_WITHOUT_API_URL || process.env.NEXT_PUBLIC_API_URL?.replace(/\/api$/, '') || window.location.origin).trim();
      const token = await auth.currentUser?.getIdToken();
      const wsUrl = `${baseUrl.replace(/^https?/, match => match === 'https' ? 'wss' : 'ws')}/api/ws/support/${activeUid}?token=${token}`;
      
      const socket = new WebSocket(wsUrl);
      
      socket.onopen = () => {
        console.log('WebSocket CONNECTED successfully for subscriber:', activeUid);
      };

      socket.onmessage = (event) => {
        console.log('WebSocket MESSAGE received:', event.data);
        const msg = JSON.parse(event.data);
        setMessages((prev) => [...prev, msg]);
      };

      socket.onerror = (error) => {
        console.error('WebSocket ERROR:', error);
      };

      socket.onclose = () => {
        console.log('WebSocket DISCONNECTED. Reconnecting in 3s...');
        setTimeout(() => {
          if (activeUid) connectWs();
        }, 3000);
      };

      setWs(socket);
      return socket;
    };
    
    let activeSocket = null;
    connectWs().then(s => { activeSocket = s; });

    return () => {
      if (activeSocket) {
        activeSocket.onclose = null; // Prevent reconnect loop on unmount
        activeSocket.close();
      }
    };
  }, [activeUid]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = (e) => {
    e.preventDefault();
    if (!input.trim() || !ws || ws.readyState !== WebSocket.OPEN) return;

    const payload = {
      text: input.trim(),
      sender_id: activeUid,
      sender_role: 'subscriber',
    };

    ws.send(JSON.stringify(payload));
    setInput('');
  };

  return (
    <div className="space-y-6 flex flex-col h-[calc(100vh-8rem)]">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
          <MessageCircle className="text-blue-600" /> Live Support
        </h1>
        <p className="text-gray-500 text-sm mt-1">Chat directly with the platform administrators.</p>
      </div>

      <div className="flex-1 bg-white border border-gray-200 rounded-2xl flex flex-col overflow-hidden shadow-2xl relative">
        <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
          {messages.length === 0 && (
            <div className="h-full flex items-center justify-center text-gray-500 flex-col gap-2">
              <MessageCircle size={32} />
              <p>No messages yet. Start the conversation!</p>
            </div>
          )}
          {messages.map((msg, idx) => {
            const isMe = msg.sender_role === 'subscriber';
            return (
              <div key={idx} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[70%] rounded-2xl px-4 py-3 ${isMe ? 'bg-blue-600 text-white rounded-br-none' : 'bg-white border-gray-200 text-gray-800 rounded-bl-none border border-gray-200'}`}>
                    <div className="flex items-center gap-2 mb-1 opacity-70">
                      <User size={12} />
                      <span className="text-[10px] uppercase font-bold tracking-wider">{msg.sender_role}</span>
                    </div>
                    <p className="text-sm">{msg.text}</p>
                    {msg.timestamp && (
                      <p className="text-[9px] opacity-60 mt-2 text-right">
                        {formatTime(msg.timestamp, userData?.custom_time_stamp)}
                      </p>
                    )}
                  </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        <div className="p-4 bg-white border-gray-200 border-t border-gray-200">
          <form onSubmit={handleSend} className="flex gap-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your message..."
              className="flex-1 bg-white border border-gray-200 rounded-xl px-4 py-3 text-gray-900 shadow-sm focus:outline-none focus:border-blue-500"
            />
            <button
              type="submit"
              disabled={!input.trim()}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              <Send size={18} /> Send
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
