(function() {
   window.WIDGET_VERSION = '1.0.8';

  let currentWs = null;

  window.restartChatbotWidget = function() {
    const config = window.CHATBOT_CONFIG || {};
    const apiKey = config.apiKey;
    if (!apiKey) return;
    
    let baseUrl = 'http://127.0.0.1:8000';
    const scriptTag = document.currentScript || document.querySelector('script[src*="widget.min.js"]') || document.querySelector('script[src*="chatbot.min.js"]') || document.querySelector('script[src*="widget-client.js"]');
    if (scriptTag && scriptTag.src) {
      const url = new URL(scriptTag.src);
      if (url.port === '5173') baseUrl = `http://${url.hostname}:8000`;
      else if (url.port) baseUrl = url.origin;
      else baseUrl = url.origin;
    }
    if (config.apiUrl) baseUrl = config.apiUrl;

    fetch(`${baseUrl}/api/widget/config`, { headers: { 'X-API-Key': apiKey } })
      .then(res => res.json())
      .then(data => {
        const conf = data.widget_config;
        if (conf.theme_color) {
          document.documentElement.style.setProperty('--theme-color', conf.theme_color);
          const textColor = getContrastYIQ(conf.theme_color);
          const fab = document.getElementById('chatbot-fab');
          const header = document.getElementById('chatbot-header');
          const sendBtn = document.getElementById('chatbot-send');
          if (fab) { fab.style.background = conf.theme_color; fab.style.color = textColor; }
          if (header) { header.style.background = conf.theme_color; header.style.color = textColor; }
          if (sendBtn) { sendBtn.style.background = conf.theme_color; sendBtn.style.color = textColor; }
          try {
            const existingStyle = document.getElementById('chatbot-theme-style');
            const styleEl = existingStyle || document.createElement('style');
            if (!existingStyle) {
              styleEl.id = 'chatbot-theme-style';
              document.head.appendChild(styleEl);
            }
            styleEl.textContent = '';
            styleEl.sheet?.insertRule(`.chat-msg.user { background: ${conf.theme_color} !important; color: ${textColor} !important; }`);
          } catch (e) {}
        }
        
        const titleEl = document.querySelector('.chatbot-title');
        if (conf.title && titleEl) titleEl.innerText = conf.title;
        
        const subtitleEl = document.querySelector('.chatbot-subtitle');
        if (conf.domain_name && subtitleEl) subtitleEl.innerText = conf.domain_name;
        
        const inputEl = document.getElementById('chatbot-input');
        if (conf.placeholder && inputEl) inputEl.placeholder = conf.placeholder;
        
        const logoEl = document.getElementById('chatbot-logo');
        if (logoEl) {
          if (conf.logo_url) {
            const logoSrc = conf.logo_url.startsWith('http') ? conf.logo_url : (baseUrl + (conf.logo_url.startsWith('/') ? '' : '/') + conf.logo_url);
            logoEl.innerHTML = `<img src="${logoSrc}" alt="logo" />`;
          } else if (conf.title) {
            logoEl.innerText = conf.title.charAt(0).toUpperCase();
          }
        }
      })
      .catch(err => console.error("Chatbot soft update failed:", err));
  };

  function initChatbotWidget() {

  function getContrastYIQ(hexcolor){
    if (!hexcolor || !/^#([0-9A-F]{3}){1,2}$/i.test(hexcolor)) return 'white';
    hexcolor = hexcolor.replace("#", "");
    if (hexcolor.length === 3) hexcolor = hexcolor.split('').map(x => x + x).join('');
    const r = parseInt(hexcolor.substr(0,2),16);
    const g = parseInt(hexcolor.substr(2,2),16);
    const b = parseInt(hexcolor.substr(4,2),16);
    const yiq = ((r*299)+(g*587)+(b*114))/1000;
    return (yiq >= 128) ? 'black' : 'white';
  }

  const config = window.CHATBOT_CONFIG || {};

  // Helper: detect local/dev environment
  function isLocalEnv() {
    const h = window.location.hostname;
    return h === 'localhost' || h === '127.0.0.1' || h === '' || h.endsWith('.local');
  }
  const apiKey = config.apiKey;
  if (!apiKey) {
    console.error("Chatbot: Missing apiKey in window.CHATBOT_CONFIG");
    return;
  }

  function _getLocal(k) { return localStorage.getItem(apiKey + '_' + k); }
  function _setLocal(k, v) { localStorage.setItem(apiKey + '_' + k, v); }
  function _removeLocal(k) { localStorage.removeItem(apiKey + '_' + k); }
  function _getSession(k) { return sessionStorage.getItem(apiKey + '_' + k); }
  function _setSession(k, v) { sessionStorage.setItem(apiKey + '_' + k, v); }
  function _removeSession(k) { sessionStorage.removeItem(apiKey + '_' + k); }


  // Determine API URL based on current script source or default
  const scriptTag = document.currentScript || document.querySelector('script[src*="widget.min.js"]') || document.querySelector('script[src*="chatbot.min.js"]') || document.querySelector('script[src*="widget-client.js"]');
  let baseUrl = 'http://127.0.0.1:8000'; // Default for local dev
  if (scriptTag && scriptTag.src) {
    const url = new URL(scriptTag.src);
    // If loaded from Vite (5173) in dev, backend port is 8000 but match hostname
    if (url.port === '5173') {
        baseUrl = `http://${url.hostname}:8000`;
    } else if (url.port) {
        baseUrl = url.origin;
    } else {
        baseUrl = url.origin;
    }
  }
  if (config.apiUrl) baseUrl = config.apiUrl;

  let widgetConfig = null;
  let ws = null;
  let sessionId = _getLocal('chatbot_session_id');
  if (!sessionId) {
    sessionId = 'sess_' + Math.random().toString(36).substring(2, 9);
    _setLocal('chatbot_session_id', sessionId);
  }

  let messageCount = parseInt(_getSession('chatbot_msg_count') || '0');
  let historyToken = _getLocal('chatbot_history_token') || _getSession('chatbot_history_token') || '';
  let leadCaptured = _getSession('chatbot_lead_captured') === 'true' ||
                     _getLocal('chatbot_lead_captured') === 'true' ||
                     !!historyToken;

  let hasMoreHistory = false;
  let lastCreatedAt = null;
  let isLoadingHistory = false;

  function getUTMParams() {
    let utm = JSON.parse(_getSession('chatbot_utm') || 'null');
    if (!utm) {
        const params = new URLSearchParams(window.location.search);
        utm = {
          utm_source: params.get('utm_source') || '',
          utm_medium: params.get('utm_medium') || '',
          utm_campaign: params.get('utm_campaign') || '',
          utm_term: params.get('utm_term') || '',
          utm_content: params.get('utm_content') || ''
        };
        _setSession('chatbot_utm', JSON.stringify(utm));
    }
    return utm;
  }
  getUTMParams();

  // Inject CSS dynamically
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  const cacheBuster = isLocalEnv() ? Date.now() : window.WIDGET_VERSION;
  link.href = `${baseUrl}/public/widget/widget.min.css?v=${cacheBuster}`;
  document.head.appendChild(link);

  // Build UI
  const container = document.createElement('div');
  container.id = 'chatbot-widget-container';
  container.style.opacity = '0';
  container.style.visibility = 'hidden';
  container.style.transition = 'opacity 0.3s ease';

  const windowEl = document.createElement('div');
  windowEl.id = 'chatbot-window';
  windowEl.innerHTML = `
    <div id="chatbot-header">
      <div id="chatbot-logo">A</div>
      <div class="chatbot-header-text">
        <h4 class="chatbot-title">Support Chat</h4>
        <p class="chatbot-subtitle">We reply instantly</p>
      </div>
      <div id="chatbot-header-actions" style="display: flex; gap: 12px; align-items: center;">
        <div id="chatbot-notification-toggle" title="Toggle Notifications" style="cursor: pointer; display: flex; align-items: center; opacity: 0.8; transition: opacity 0.2s;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.8">
          <svg id="chatbot-bell-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>
        </div>
        <div id="chatbot-close" style="cursor: pointer; display: flex; align-items: center; opacity: 0.8; transition: opacity 0.2s;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.8">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </div>
      </div>
    </div>
    <div id="chatbot-messages"></div>
    <div id="chatbot-input-area">
      <input type="text" id="chatbot-input" placeholder="Type your question..." autocomplete="off" disabled />
      <button id="chatbot-send" disabled>
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"></path></svg>
      </button>
    </div>
  `;

  const fabEl = document.createElement('div');
  fabEl.id = 'chatbot-fab';
  fabEl.style.position = 'relative';
  fabEl.innerHTML = `
    <svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"></path></svg>
    <div id="chatbot-unread-badge" style="position: absolute; top: -5px; right: -5px; background: #ef4444; color: white; border-radius: 50%; padding: 2px 6px; font-size: 12px; font-weight: bold; display: none; box-shadow: 0 2px 4px rgba(0,0,0,0.2); z-index: 10;">0</div>
  `;

  container.appendChild(windowEl);
  container.appendChild(fabEl);
  document.body.appendChild(container);

  const messagesEl = document.getElementById('chatbot-messages');
  const inputEl = document.getElementById('chatbot-input');
  const sendBtn = document.getElementById('chatbot-send');
  const unreadBadge = document.getElementById('chatbot-unread-badge');
  let unreadCount = 0;
  let isSendingMessage = false;

  function setChatMode(mode) {
    const subtitle = document.querySelector('.chatbot-subtitle');
    if (!subtitle) return;
    if (mode === 'admin') {
      subtitle.innerHTML = '<span style="color:#10b981;">●</span> Chatting with Support Agent';
    } else if (mode === 'ai') {
      subtitle.innerHTML = '<span style="color:#3b82f6;">●</span> Chatting with AI Assistant';
    } else {
      subtitle.innerHTML = 'We reply instantly';
    }
  }

  // Load Config
  fetch(`${baseUrl}/api/widget/config`, {
    headers: { 'X-API-Key': apiKey }
  })
  .then(res => {
    if (!res.ok) throw new Error("Invalid widget API key or inactive domain");
    return res.json();
  })
  .then(data => {
    widgetConfig = data;
    
    // Notification permission request is deferred until after details are submitted and saved.
    
    // Apply styling from config
    const conf = data.widget_config;
    if (conf.theme_color) {
      document.documentElement.style.setProperty('--theme-color', conf.theme_color);
      const textColor = getContrastYIQ(conf.theme_color);
      const fabEl = document.getElementById('chatbot-fab');
      const headerEl = document.getElementById('chatbot-header');
      const sendBtn = document.getElementById('chatbot-send');
      if (fabEl) { fabEl.style.background = conf.theme_color; fabEl.style.color = textColor; }
      if (headerEl) { headerEl.style.background = conf.theme_color; headerEl.style.color = textColor; }
      if (sendBtn) { sendBtn.style.background = conf.theme_color; sendBtn.style.color = textColor; }
        // create a dynamic rule for .chat-msg.user (safe handling)
        try {
          const existingStyle = document.getElementById('chatbot-theme-style');
          const styleEl = existingStyle || document.createElement('style');
          if (!existingStyle) {
            styleEl.id = 'chatbot-theme-style';
            document.head.appendChild(styleEl);
          }
          // Clear any existing rules by resetting the style element
          styleEl.textContent = '';
          styleEl.sheet?.insertRule(`.chat-msg.user { background: ${conf.theme_color} !important; color: ${textColor} !important; }`);

        } catch (e) {
          console.warn('Unable to insert dynamic CSS rule:', e);
        }
    }
    if (conf.title) document.querySelector('.chatbot-title').innerText = conf.title;
    if (conf.domain_name) document.querySelector('.chatbot-subtitle').innerText = conf.domain_name;
    if (conf.placeholder) inputEl.placeholder = conf.placeholder;
    
    const logoEl = document.getElementById('chatbot-logo');
    if (logoEl) {
      if (conf.logo_url) {
        const logoSrc = conf.logo_url.startsWith('http') ? conf.logo_url : (baseUrl + (conf.logo_url.startsWith('/') ? '' : '/') + conf.logo_url);
        logoEl.innerHTML = `<img src="${logoSrc}" alt="logo" />`;
      } else if (conf.title) {
        logoEl.innerText = conf.title.charAt(0).toUpperCase();
        if (conf.theme_color) logoEl.style.color = conf.theme_color;
      }
    }

    // Domain validation: in live mode, check current domain matches configured domain.
    // If mismatch, inform the user that the chatbot is temporarily unavailable.
    const configuredDomain = (conf.domain_url || conf.domain_name || '').replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].toLowerCase();
    const currentDomain = window.location.hostname.toLowerCase().replace(/^www\./, '');
    const domainMatch = !configuredDomain || currentDomain === configuredDomain;

    if (!domainMatch) {
      if (container && container.parentNode) {
        container.parentNode.removeChild(container);
      }
      return;
    }

    // Load session history from backend server only when this browser has a signed token.
    const sessionHistoryUrl = historyToken
      ? `${baseUrl}/api/widget/session/${sessionId}?history_token=${encodeURIComponent(historyToken)}`
      : null;
    if (!sessionHistoryUrl) {
      addMessage(conf.welcome_message, 'bot');
      renderQuickReplies();
      setChatMode('ai');
      enableChatInput();
      finalizeInitialization();
      if (!ws && widgetConfig) connectWs();
      return;
    }

    fetch(sessionHistoryUrl, {
      headers: { 'X-API-Key': apiKey }
    })
    .then(res => {
      if (!res.ok) {
        // Handle 404 or other HTTP errors silently
        return { session_exists: false };
      }
      return res.json();
    })
    .then(sessionData => {
      if (sessionData && sessionData.session_exists && sessionData.messages && sessionData.messages.length > 0) {
        const unreadFromBackend = sessionData.unread_customer_count || 0;
        const total = sessionData.messages.length;

        sessionData.messages.forEach((m, idx) => {
          if (unreadFromBackend > 0 && idx === total - unreadFromBackend) {
              const wrap = document.createElement('div');
              wrap.id = 'chatbot-unread-divider-wrap';
              wrap.style.textAlign = 'center';
              wrap.style.margin = '16px 0';
              wrap.innerHTML = `<div id="chatbot-unread-divider" style="font-size: 11px; color: var(--theme-color, #3b82f6); font-weight: bold; padding: 4px 12px; background-color: #eff6ff; border-radius: 12px; display: inline-block;">${unreadFromBackend === 1 ? '1 UNREAD MESSAGE' : unreadFromBackend + ' UNREAD MESSAGES'}</div>`;
              messagesEl.appendChild(wrap);
              
              unreadCount = unreadFromBackend;
              if (unreadBadge) {
                 unreadBadge.innerText = unreadCount.toString();
                 unreadBadge.style.display = 'block';
              }
          }
          let sender = 'bot';
          if (m.sender === 'customer') sender = 'user';
          else if (m.sender === 'ai') sender = 'bot';
          else if (m.sender === 'admin') sender = 'bot';
          else if (m.sender === 'system') sender = 'error';
          addMessage(m.message || m.text, sender, true, m.timestamp || m.created_at);
        });
      } else {
        // If session not found or empty
        if (!sessionData || !sessionData.session_exists) {
          _removeLocal('chatbot_session_id');
          sessionId = 'sess_' + Math.random().toString(36).substring(2, 9);
          _setLocal('chatbot_session_id', sessionId);
        }
        addMessage(conf.welcome_message, 'bot');
        renderQuickReplies();
        setChatMode('ai');
      }

      if (sessionData && sessionData.session_exists) {
        if (sessionData.ai_enabled === false || sessionData.admin_joined) {
          setChatMode('admin');
        } else {
          setChatMode('ai');
        }
      }

      enableChatInput();
      finalizeInitialization();
      if (!ws && widgetConfig) connectWs();
    })
    .catch(err => {
      // On network failure or JSON parse error, silently create new session
      _removeLocal('chatbot_session_id');
      sessionId = 'sess_' + Math.random().toString(36).substring(2, 9);
      _setLocal('chatbot_session_id', sessionId);
      
      addMessage(conf.welcome_message, 'bot');
      renderQuickReplies();
      enableChatInput();
      finalizeInitialization();
      if (!ws && widgetConfig) connectWs();
    });
  })
  .catch(err => {
    console.error("Chatbot Widget Error:", err);
    // If domain is inactive or API key invalid, hide the widget entirely
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
  });

  function finalizeInitialization() {
    container.style.visibility = 'visible';
    container.style.opacity = '1';
    container.classList.add('loaded');
  }

  // UI Interactions
  let isOpen = false;
  fabEl.addEventListener('click', () => {
    isOpen = !isOpen;
    if (isOpen) {
      windowEl.classList.add('open');
      fabEl.style.transform = 'scale(0)';
      inputEl.focus();
      
      if (unreadCount > 0) {
        const wrap = document.getElementById('chatbot-unread-divider-wrap');
        if (wrap) {
           setTimeout(() => {
              wrap.scrollIntoView({ behavior: 'smooth', block: 'center' });
           }, 50);
        }
      }

      unreadCount = 0;
      if (unreadBadge) {
        unreadBadge.innerText = '0';
        unreadBadge.style.display = 'none';
      }

      if (!ws && widgetConfig) {
         connectWs();
      } else if (ws && ws.readyState === WebSocket.OPEN) {
         ws.send(JSON.stringify({ type: 'read_ack' }));
      }
    }
  });

  document.getElementById('chatbot-close').addEventListener('click', () => {
    isOpen = false;
    windowEl.classList.remove('open');
    fabEl.style.transform = 'scale(1)';
    
    const old = document.getElementById('chatbot-unread-divider-wrap');
    if (old) old.remove();
  });

  const notifToggle = document.getElementById('chatbot-notification-toggle');
  const bellIcon = document.getElementById('chatbot-bell-icon');
  
  function updateBellIcon() {
    if (!("Notification" in window)) {
      if(notifToggle) notifToggle.style.display = 'none';
      return;
    }
    const isEnabled = _getLocal('chatbot_notification_preference') === 'enabled' && Notification.permission === 'granted';
    if (isEnabled) {
      bellIcon.setAttribute('fill', 'currentColor');
    } else {
      bellIcon.setAttribute('fill', 'none');
    }
  }

  if (notifToggle) {
    updateBellIcon();
    notifToggle.addEventListener('click', () => {
      if (!("Notification" in window)) return;
      
      // Mark prompt as shown so we don't ask again later
      _setLocal('chatbot_notification_prompt_shown', 'true');
      _setSession('chatbot_notification_prompt_shown', 'true');

      const isEnabled = _getLocal('chatbot_notification_preference') === 'enabled' && Notification.permission === 'granted';
      
      if (isEnabled) {
        // Disable locally
        _setLocal('chatbot_notification_preference', 'disabled');
        _setSession('notification_preference', 'disabled');
        updateBellIcon();
      } else {
        // Enable
        if (Notification.permission === 'granted') {
          _setLocal('chatbot_notification_preference', 'enabled');
          _setSession('notification_preference', 'enabled');
          updateBellIcon();
        } else if (Notification.permission !== 'denied') {
          Notification.requestPermission().then(permission => {
            if (permission === 'granted') {
              _setLocal('chatbot_notification_preference', 'enabled');
              _setSession('notification_preference', 'enabled');
            } else {
              _setLocal('chatbot_notification_preference', 'disabled');
              _setSession('notification_preference', 'disabled');
            }
            updateBellIcon();
          });
        } else {
          alert("Notification permission is blocked by your browser. Please enable it in your browser's site settings.");
        }
      }
    });
  }

  messagesEl.addEventListener('scroll', () => {
    if (messagesEl.scrollTop === 0) {
      if (historyToken) {
        loadMoreHistory(historyToken);
      }
    }
  });

  function enableChatInput() {
    inputEl.removeAttribute('disabled');
    sendBtn.style.display = '';
    sendBtn.removeAttribute('disabled');
    inputEl.focus();
  }

  function disableChatInput() {
    inputEl.setAttribute('disabled', 'true');
    sendBtn.setAttribute('disabled', 'true');
  }

  function saveMessageLocally(text, sender, timestamp = null) {
    if (_getLocal('chatbot_consent_local_storage') === 'yes') {
      try {
        const msgs = JSON.parse(_getLocal('chatbot_local_messages') || '[]');
        msgs.push({ text: text, sender: sender, timestamp: timestamp || new Date().toISOString() });
        _setLocal('chatbot_local_messages', JSON.stringify(msgs));
      } catch (e) {
        console.error("Error saving local message", e);
      }
    }
  }

  function addMessage(text, sender, skipSave = false, timestamp = null) {
    removeTyping();
    const msg = document.createElement('div');
    msg.className = `chat-msg ${sender}`;
    // simple html format for line breaks
    let formattedText = text.replace(/\\n/g, '<br/>');
    
    if (!timestamp) timestamp = new Date().toISOString();
    const dateObj = new Date(timestamp);
    const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    formattedText += `<span class="msg-time" data-timestamp="${timestamp}" style="display: inline-block; font-size: 10px; opacity: 0.65; float: right; margin-top: 8px; margin-left: 12px; line-height: 1;">${timeStr}</span><div style="clear: both;"></div>`;
    
    msg.innerHTML = formattedText;
    messagesEl.appendChild(msg);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    if (!skipSave) {
      saveMessageLocally(text, sender, timestamp);
    }
  }

  function prependMessage(text, sender, timestamp = null) {
    const msg = document.createElement('div');
    msg.className = `chat-msg ${sender}`;
    let formattedText = text.replace(/\\n/g, '<br/>');
    if (timestamp) {
        const dateObj = new Date(timestamp);
        const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        formattedText += `<span class="msg-time" data-timestamp="${timestamp}" style="display: inline-block; font-size: 10px; opacity: 0.65; float: right; margin-top: 8px; margin-left: 12px; line-height: 1;">${timeStr}</span><div style="clear: both;"></div>`;
    }
    msg.innerHTML = formattedText;
    messagesEl.insertBefore(msg, messagesEl.firstChild);
  }

  function loadMoreHistory(token) {
    if (isLoadingHistory || !hasMoreHistory || !lastCreatedAt) return;
    isLoadingHistory = true;

    const loader = document.createElement('div');
    loader.className = 'chat-msg';
    loader.style.alignSelf = 'center';
    loader.style.fontSize = '12px';
    loader.style.color = '#94a3b8';
    loader.innerText = 'Loading older messages...';
    messagesEl.insertBefore(loader, messagesEl.firstChild);

    const previousScrollHeight = messagesEl.scrollHeight;

    fetch(`${baseUrl}/api/widget/history?history_token=${encodeURIComponent(token)}&last_created_at=${encodeURIComponent(lastCreatedAt)}&limit=10`, {
      headers: { 'X-API-Key': apiKey }
    })
    .then(res => res.json())
    .then(data => {
      loader.remove();
      if (data.messages && data.messages.length > 0) {
        const reversed = [...data.messages].reverse();
        reversed.forEach(m => {
          if (m.response) prependMessage(m.response, 'bot', m.timestamp || m.created_at);
          if (m.query) prependMessage(m.query, 'user', m.timestamp || m.created_at);
        });

        lastCreatedAt = data.messages[data.messages.length - 1].created_at;
        hasMoreHistory = data.has_more;

        messagesEl.scrollTop = messagesEl.scrollHeight - previousScrollHeight;
      } else {
        hasMoreHistory = false;
      }
      isLoadingHistory = false;
    })
    .catch(err => {
      console.error(err);
      loader.remove();
      isLoadingHistory = false;
    });
  }

  function fetchHistoryFromServer(token) {
    messagesEl.innerHTML = '';
    showTyping();
    fetch(`${baseUrl}/api/widget/history?history_token=${encodeURIComponent(token)}&limit=10`, {
      headers: { 'X-API-Key': apiKey }
    })
    .then(res => res.json())
    .then(data => {
      removeTyping();
      if (data.messages && data.messages.length > 0) {
        const reversed = [...data.messages].reverse();
        reversed.forEach(m => {
          if (m.query) addMessage(m.query, 'user', true, m.timestamp || m.created_at);
          if (m.response) addMessage(m.response, 'bot', true, m.timestamp || m.created_at);
        });

        lastCreatedAt = data.messages[data.messages.length - 1].created_at;
        hasMoreHistory = data.has_more;
        
        if (data.messages[0].session_id) {
          sessionId = data.messages[0].session_id;
          if (_getLocal('chatbot_consent_local_storage') === 'yes') {
            _setLocal('chatbot_local_session_id', sessionId);
          } else {
            _setSession('chatbot_session_id', sessionId);
          }
        }
        
        // Infer mode from recent messages
        if (reversed.length > 0) {
           const lastBotMsg = reversed.slice().reverse().find(m => m.sender === 'admin' || m.sender === 'ai');
           if (lastBotMsg && lastBotMsg.sender === 'admin') {
             setChatMode('admin');
           } else {
             setChatMode('ai');
           }
        }

      } else {
        if (widgetConfig) {
          addMessage(widgetConfig.widget_config.welcome_message, 'bot');
          renderQuickReplies();
          setChatMode('ai');
        }
      }
      enableChatInput();
    })
    .catch(err => {
      console.error(err);
      removeTyping();
      if (widgetConfig) {
        addMessage(widgetConfig.widget_config.welcome_message, 'bot');
        renderQuickReplies();
      }
      enableChatInput();
    });
  }

  let typingIndicator = null;
  let streamingMessage = null;
  let streamingText = '';
  let quickRepliesEl = null;

  function showTyping() {
    if (typingIndicator) return;
    typingIndicator = document.createElement('div');
    typingIndicator.className = 'typing-indicator';
    typingIndicator.innerHTML = '<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';
    messagesEl.appendChild(typingIndicator);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function removeTyping() {
    if (typingIndicator) {
      typingIndicator.remove();
      typingIndicator = null;
    }
  }

  function clearQuickReplies() {
    if (quickRepliesEl) {
      quickRepliesEl.remove();
      quickRepliesEl = null;
    }
  }

  function renderQuickReplies() {
    clearQuickReplies();
    const replies = widgetConfig && widgetConfig.widget_config ? widgetConfig.widget_config.quick_replies : [];
    if (!Array.isArray(replies) || replies.length === 0) return;

    quickRepliesEl = document.createElement('div');
    quickRepliesEl.className = 'chatbot-quick-replies';
    replies.forEach(reply => {
      const text = typeof reply === 'string' ? reply : (reply.text || reply.label || '');
      const label = typeof reply === 'string' ? reply : (reply.label || reply.text || '');
      if (!text || !label) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chatbot-quick-reply';
      btn.textContent = label;
      btn.addEventListener('click', () => {
        clearQuickReplies();
        inputEl.value = text;
        sendMessage();
      });
      quickRepliesEl.appendChild(btn);
    });

    if (quickRepliesEl.children.length > 0) {
      messagesEl.appendChild(quickRepliesEl);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }
  }

  function renderMessageText(el, text) {
    const escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
    el.innerHTML = escaped.replace(/\n/g, '<br/>');
  }

  function appendStreamToken(token) {
    removeTyping();
    clearQuickReplies();
    if (!streamingMessage) {
      streamingMessage = document.createElement('div');
      streamingMessage.className = 'chat-msg bot';
      messagesEl.appendChild(streamingMessage);
      streamingText = '';
    }
    streamingText += token;
    renderMessageText(streamingMessage, streamingText);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function finishStreamMessage() {
    if (streamingMessage) {
      const timestamp = new Date().toISOString();
      const dateObj = new Date(timestamp);
      const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const timeEl = document.createElement('div');
      timeEl.className = 'msg-time';
      timeEl.setAttribute('data-timestamp', timestamp);
      timeEl.style.fontSize = '10px';
      timeEl.style.opacity = '0.65';
      timeEl.style.marginTop = '4px';
      timeEl.style.textAlign = 'right';
      timeEl.innerText = timeStr;
      streamingMessage.appendChild(timeEl);
    }
    streamingMessage = null;
    streamingText = '';
    isSendingMessage = false;
    enableChatInput();
  }

  // WebSocket Logic — no polling, all updates via WebSocket only
  let wsReconnectAttempts = 0;
  const WS_MAX_RECONNECT_ATTEMPTS = 5;
  const WS_BASE_RECONNECT_DELAY = 3000; // 3 seconds
  const WS_MAX_RECONNECT_DELAY = 60000; // 60 seconds

  function attemptWsReconnect() {
    if (wsReconnectAttempts >= WS_MAX_RECONNECT_ATTEMPTS) {
      console.warn('Chatbot: WebSocket reconnect attempts exhausted.');
      addMessage("Connection failed. Please refresh the page.", "error");
      isSendingMessage = false;
      enableChatInput();
      return;
    }
    const delay = Math.min(WS_BASE_RECONNECT_DELAY * Math.pow(2, wsReconnectAttempts), WS_MAX_RECONNECT_DELAY);
    wsReconnectAttempts++;
    setTimeout(() => {
      if (!ws && widgetConfig && isOpen) {
        connectWs();
      }
    }, delay);
  }

  function connectWs() {
    let wsUrl = widgetConfig.ws_url;
    if (baseUrl.startsWith('https://') || window.location.protocol === 'https:') {
       wsUrl = wsUrl.replace('ws://', 'wss://');
    } else {
       wsUrl = wsUrl.replace('wss://', 'ws://');
    }
    // ensure domain_id and session_id are passed
    const u = new URL(wsUrl);
    u.searchParams.append('domain_id', apiKey);
    u.searchParams.append('session_id', sessionId);

    ws = new WebSocket(u.toString());
    currentWs = ws;

    ws.onopen = () => {
      wsReconnectAttempts = 0; // Reset on successful connection
      if (isOpen) {
        ws.send(JSON.stringify({ type: 'read_ack' }));
      }
    };

    ws.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.type === 'message' || data.type === 'admin_message') {
        if (data.message || data.text) {
          if (!isOpen && unreadCount === 0) {
              const old = document.getElementById('chatbot-unread-divider-wrap');
              if (old) old.remove();
              const wrap = document.createElement('div');
              wrap.id = 'chatbot-unread-divider-wrap';
              wrap.style.textAlign = 'center';
              wrap.style.margin = '16px 0';
              wrap.innerHTML = '<div id="chatbot-unread-divider" style="font-size: 11px; color: var(--theme-color, #3b82f6); font-weight: bold; padding: 4px 12px; background-color: #eff6ff; border-radius: 12px; display: inline-block;">1 UNREAD MESSAGE</div>';
              messagesEl.appendChild(wrap);
          }

          addMessage(data.message || data.text, 'bot', false, data.timestamp || data.created_at);
          
          if (data.sender === 'admin' || data.type === 'admin_message') {
             setChatMode('admin');
          } else if (data.sender === 'ai' || data.source === 'ai') {
             setChatMode('ai');
          }

          // Show browser notification if user is not focused or tab hidden
          const pref = _getSession('notification_preference') || _getLocal('chatbot_notification_preference');
          const perm = _getSession('notification_permission') || _getLocal('chatbot_notification_permission') || (typeof Notification !== 'undefined' ? Notification.permission : 'denied');
          if (pref === 'enabled' && perm === 'granted' && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            const title = data.type === 'admin_message' ? 'Support Team Reply' : 'New Message';
            const body = data.message || data.text;
            new Notification(title, { body: body });
          }

          if (!isOpen) {
            unreadCount++;
            const divEl = document.getElementById('chatbot-unread-divider');
            if (divEl) divEl.innerText = unreadCount === 1 ? '1 UNREAD MESSAGE' : unreadCount + ' UNREAD MESSAGES';

            if (unreadBadge) {
               unreadBadge.innerText = unreadCount.toString();
               unreadBadge.style.display = 'block';
            }
          }

          const leadStatus = widgetConfig && widgetConfig.widget_config && widgetConfig.widget_config.lead_collection ? widgetConfig.widget_config.lead_collection.status : true;
          const leadLimit = widgetConfig && widgetConfig.widget_config && widgetConfig.widget_config.lead_collection ? widgetConfig.widget_config.lead_collection.limit : 2;
          
          if (leadStatus && messageCount >= leadLimit && !leadCaptured) {
            setTimeout(showLeadCaptureForm, 1000);
          } else {
            isSendingMessage = false;
            enableChatInput();
          }
        }
      } else if (data.type === 'typing') {
        showTyping();
      } else if (data.type === 'stream_delta') {
        appendStreamToken(data.text || '');
      } else if (data.type === 'stream_done') {
        finishStreamMessage();
      } else if (data.type === 'error') {
        addMessage(data.text, 'error');
        
        const leadStatus = widgetConfig && widgetConfig.widget_config && widgetConfig.widget_config.lead_collection ? widgetConfig.widget_config.lead_collection.status : true;
        const leadLimit = widgetConfig && widgetConfig.widget_config && widgetConfig.widget_config.lead_collection ? widgetConfig.widget_config.lead_collection.limit : 2;
        
        if (leadStatus && messageCount >= leadLimit && !leadCaptured) {
          setTimeout(showLeadCaptureForm, 1000);
        } else {
          isSendingMessage = false;
          enableChatInput();
        }
      } else if (data.type === 'system') {
        if (data.text || data.message) {
           addMessage(data.text || data.message, 'bot');
           if ((data.text || data.message).toLowerCase().includes('ai assistant')) {
              setChatMode('ai');
           }
        }
        isSendingMessage = false;
        enableChatInput();
      }
    };

    ws.onclose = () => {
      ws = null;
      // Attempt WebSocket reconnect only — no polling fallback
      attemptWsReconnect();
    };
  }

  function askNotificationPreference() {
    if (_getSession('chatbot_notification_asked') === 'true') {
      enableChatInput();
      return;
    }
    
    const msg = document.createElement('div');
    msg.className = `chat-msg bot`;
    msg.innerHTML = `
      <div style="font-weight:700; font-size:14px; margin-bottom:4px; color:#1e293b;">Stay Updated</div>
      <div style="font-size:12px; color:#64748b; line-height:1.4; margin-bottom:12px;">
        Your conversation has been saved. Would you like to receive notifications when our support team replies?
      </div>
      <div style="display:flex; gap:8px;">
        <button id="noti-enable" style="flex:1; padding:8px; background:var(--theme-color, #3B82F6); color:white; border:none; border-radius:6px; cursor:pointer; font-weight:bold; font-size:12px;">Enable Notifications</button>
        <button id="noti-deny" style="flex:1; padding:8px; background:#e2e8f0; color:#475569; border:none; border-radius:6px; cursor:pointer; font-weight:bold; font-size:12px;">Not Now</button>
      </div>
    `;
    messagesEl.appendChild(msg);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    
    document.getElementById('noti-deny').addEventListener('click', () => {
      _setSession('chatbot_notification_asked', 'true');
      _setSession('notification_preference', 'disabled');
      _setLocal('chatbot_notification_preference', 'disabled');
      _setSession('updated_at', new Date().toISOString());
      msg.innerHTML = '<div style="font-size:12px; color:#64748b;">Notifications disabled.</div>';
      enableChatInput();
    });
    
    document.getElementById('noti-enable').addEventListener('click', () => {
      _setSession('chatbot_notification_asked', 'true');
      _setSession('notification_preference', 'enabled');
      _setLocal('chatbot_notification_preference', 'enabled');
      _setSession('updated_at', new Date().toISOString());
      
      if ("Notification" in window) {
        Notification.requestPermission().then(permission => {
          _setSession('notification_permission', permission);
          _setLocal('chatbot_notification_permission', permission);
          if (permission === 'granted') {
            msg.innerHTML = '<div style="font-size:12px; color:#10b981; font-weight:600;">Notifications enabled!</div>';
          } else {
            msg.innerHTML = '<div style="font-size:12px; color:#ef4444;">Notification permission denied.</div>';
          }
          enableChatInput();
        }).catch(err => {
          console.error("Error requesting permission", err);
          enableChatInput();
        });
      } else {
        msg.innerHTML = '<div style="font-size:12px; color:#64748b;">Notifications not supported by your browser.</div>';
        enableChatInput();
      }
    });
  }
  function askNotificationPreference() {
    if (_getLocal('chatbot_notification_prompt_shown') === 'true' || _getSession('chatbot_notification_prompt_shown') === 'true') {
      enableChatInput();
      return;
    }
    
    if (!("Notification" in window)) {
      enableChatInput();
      return;
    }

    if (Notification.permission === 'granted' || Notification.permission === 'denied') {
      _setLocal('chatbot_notification_prompt_shown', 'true');
      enableChatInput();
      return;
    }

    const msg = document.createElement('div');
    msg.className = `chat-msg bot`;
    msg.innerHTML = `
      <div style="font-weight:600; margin-bottom:8px; font-size:13px;">Would you like to receive notifications when support replies?</div>
      <div style="display:flex; gap:8px;">
        <button id="notify-yes" style="flex:1; padding:6px 12px; background:#10b981; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:bold; font-size:12px;">Enable Notifications</button>
        <button id="notify-no" style="flex:1; padding:6px 12px; background:#ef4444; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:bold; font-size:12px;">Not Now</button>
      </div>
    `;
    messagesEl.appendChild(msg);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    document.getElementById('notify-yes').addEventListener('click', () => {
      msg.innerHTML = '<div style="font-weight:600; color:#475569; font-size:13px;">Requesting permission...</div>';
      Notification.requestPermission().then(permission => {
        _setLocal('chatbot_notification_prompt_shown', 'true');
        if (permission === 'granted') {
          _setSession('notification_preference', 'enabled');
          _setLocal('chatbot_notification_preference', 'enabled');
          _setSession('notification_permission', 'granted');
          _setLocal('chatbot_notification_permission', 'granted');
          msg.innerHTML = '<div style="font-weight:600; color:#10b981; font-size:13px;">Notifications enabled.</div>';
        } else {
          msg.style.display = 'none';
        }
        enableChatInput();
      }).catch(err => {
        msg.style.display = 'none';
        enableChatInput();
      });
    });

    document.getElementById('notify-no').addEventListener('click', () => {
      _setLocal('chatbot_notification_prompt_shown', 'true');
      msg.style.display = 'none';
      enableChatInput();
    });
  }

  function showLeadCaptureForm() {
    disableChatInput();
    const msg = document.createElement('div');
    msg.className = `chat-msg bot`;
    
    const fields = widgetConfig && widgetConfig.widget_config && widgetConfig.widget_config.lead_collection && widgetConfig.widget_config.lead_collection.fields 
       ? widgetConfig.widget_config.lead_collection.fields 
       : ['name', 'email', 'phone'];
       
    let inputsHtml = '<div style="font-weight:600; margin-bottom:8px; font-size:13px;">Can we get your details to assist you better?</div>';
    if (fields.includes('name')) {
      inputsHtml += '<input type="text" id="lead-name" placeholder="Name" style="width:100%; box-sizing:border-box; margin-bottom:8px; padding:8px; border:1px solid #ccc; border-radius:4px; font-size:13px;" />';
    }
    if (fields.includes('email')) {
      inputsHtml += '<input type="email" id="lead-email" placeholder="Email" style="width:100%; box-sizing:border-box; margin-bottom:8px; padding:8px; border:1px solid #ccc; border-radius:4px; font-size:13px;" />';
    }
    if (fields.includes('phone')) {
      inputsHtml += '<input type="tel" id="lead-phone" placeholder="Phone Number" style="width:100%; box-sizing:border-box; margin-bottom:8px; padding:8px; border:1px solid #ccc; border-radius:4px; font-size:13px;" />';
    }
    inputsHtml += '<button id="lead-submit" style="width:100%; padding:8px; background:var(--theme-color, #3B82F6); color:white; border:none; border-radius:4px; cursor:pointer; font-weight:bold; font-size:13px;">Submit</button>';
    
    msg.innerHTML = inputsHtml;
    messagesEl.appendChild(msg);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    document.getElementById('lead-submit').addEventListener('click', () => {
      const nameEl = document.getElementById('lead-name');
      const emailEl = document.getElementById('lead-email');
      const phoneEl = document.getElementById('lead-phone');
      
      const name = nameEl ? nameEl.value.trim() : '';
      const email = emailEl ? emailEl.value.trim() : '';
      const phone = phoneEl ? phoneEl.value.trim() : '';
      
      let missing = false;
      if (fields.includes('name') && !name) missing = true;
      if (fields.includes('email') && !email) missing = true;
      if (fields.includes('phone') && !phone) missing = true;
      
      if (missing) {
        alert('Please fill out all required fields.');
        return;
      }
      
      const btn = document.getElementById('lead-submit');
      btn.innerText = 'Submitting...';
      btn.disabled = true;

      fetch(`${baseUrl}/api/widget/lead`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey
        },
        body: JSON.stringify({
          session_id: sessionId,
          name: name || "Not Provided",
          email: email || "no-reply@domain.com",
          phone: phone || "Not Provided",
          utm: getUTMParams()
        })
      }).then(res => res.json()).then(leadData => {
        historyToken = leadData.history_token || '';
        if (historyToken) {
          _setSession('chatbot_history_token', historyToken);
          _setLocal('chatbot_history_token', historyToken);
        }
        fetch(`${baseUrl}/api/widget/history?history_token=${encodeURIComponent(historyToken)}&limit=10`, {
          headers: { 'X-API-Key': apiKey }
        })
        .then(res => res.json())
        .then(data => {
          _setSession('chatbot_lead_captured', 'true');
          _setLocal('chatbot_lead_captured', 'true');
          leadCaptured = true;

          const olderMessages = data.messages ? data.messages.filter(m => m.session_id !== sessionId) : [];
          
          if (olderMessages.length > 0) {
            msg.innerHTML = `
              <div style="font-weight:600; color:#10b981; font-size:13px; margin-bottom:8px;">Thank you! We have received your details.</div>
              <div style="font-size:12px; margin-bottom:8px; color:#475569; line-height: 1.4;">We found a previous conversation. Would you like to restore/maintain your history?</div>
              <div style="display:flex; gap:8px;">
                <button id="restore-yes" style="flex:1; padding:6px 12px; background:#10b981; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:bold; font-size:12px;">Yes, Restore</button>
                <button id="restore-no" style="flex:1; padding:6px 12px; background:#ef4444; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:bold; font-size:12px;">No, Start Fresh</button>
              </div>
            `;

            document.getElementById('restore-yes').addEventListener('click', () => {
              _setLocal('chatbot_consent_local_storage', 'yes');
              if (historyToken) _setLocal('chatbot_history_token', historyToken);
              
              _setSession('session_id', sessionId);
              _setSession('customer_name', name);
              _setSession('customer_email', email);
              _setSession('customer_phone', phone);
              _setSession('created_at', _getSession('created_at') || new Date().toISOString());
              _setSession('updated_at', new Date().toISOString());

              msg.innerHTML = '<div style="font-weight:600; color:#10b981; font-size:13px;">History restored.</div>';
              
              const currentLocalMsgs = JSON.parse(_getLocal('chatbot_local_messages') || '[]');
              const msgsToSave = [];

              // Prepend to DOM: olderMessages is newest to oldest. Prepend pushes oldest to top.
              olderMessages.forEach(m => {
                if (m.response) {
                  prependMessage(m.response, 'bot', m.timestamp || m.created_at);
                }
                if (m.query) {
                  prependMessage(m.query, 'user', m.timestamp || m.created_at);
                }
              });

              // Save to localStorage: reverse to get oldest to newest
              const reversed = [...olderMessages].reverse();
              reversed.forEach(m => {
                if (m.query) {
                  msgsToSave.push({ text: m.query, sender: 'user', timestamp: m.timestamp || m.created_at });
                }
                if (m.response) {
                  msgsToSave.push({ text: m.response, sender: 'bot', timestamp: m.timestamp || m.created_at });
                }
              });

              // Re-append current session messages so they aren't lost
              msgsToSave.push(...currentLocalMsgs);
              _setLocal('chatbot_local_messages', JSON.stringify(msgsToSave));

              lastCreatedAt = olderMessages.length > 0 ? olderMessages[olderMessages.length - 1].created_at : null;
              hasMoreHistory = data.has_more;

              if (olderMessages[0] && olderMessages[0].session_id) {
                sessionId = olderMessages[0].session_id;
                _setLocal('chatbot_session_id', sessionId);
                
                // Re-submit the lead to attach the name to the RESTORED session history!
                fetch(`${baseUrl}/api/widget/lead`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
                  body: JSON.stringify({ session_id: sessionId, name: name, email: email, phone: phone, utm: getUTMParams() })
                }).then(res => res.json()).then(leadData => {
                  historyToken = leadData.history_token || historyToken;
                  if (historyToken) {
                    _setSession('chatbot_history_token', historyToken);
                    _setLocal('chatbot_history_token', historyToken);
                  }
                }).catch(() => {});

                if (ws) {
                  ws.close();
                  connectWs();
                }
              }
              askNotificationPreference();
            });

            document.getElementById('restore-no').addEventListener('click', () => {
              _setLocal('chatbot_consent_local_storage', 'no');
              _removeLocal('chatbot_history_token');
              _removeLocal('chatbot_local_session_id');
              _removeLocal('chatbot_local_messages');
              
              _setSession('session_id', sessionId);
              _setSession('customer_name', name);
              _setSession('customer_email', email);
              _setSession('customer_phone', phone);
              _setSession('created_at', _getSession('created_at') || new Date().toISOString());
              _setSession('updated_at', new Date().toISOString());

              msg.innerHTML = '<div style="font-weight:600; color:#475569; font-size:13px;">Starting fresh session. History skipped.</div>';
              askNotificationPreference();
            });
          } else {
            msg.innerHTML = `
              <div style="font-weight:600; color:#10b981; font-size:13px; margin-bottom:8px;">Thank you! We have received your details.</div>
              <div style="font-size:12px; margin-bottom:8px; color:#475569; line-height: 1.4;">Would you like us to save your chat history on this device so you can continue this conversation later?</div>
              <div style="display:flex; gap:8px;">
                <button id="consent-yes" style="flex:1; padding:6px 12px; background:#10b981; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:bold; font-size:12px;">Yes, Save</button>
                <button id="consent-no" style="flex:1; padding:6px 12px; background:#ef4444; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:bold; font-size:12px;">No</button>
              </div>
            `;

            document.getElementById('consent-yes').addEventListener('click', () => {
              _setLocal('chatbot_consent_local_storage', 'yes');
              _setLocal('chatbot_local_session_id', sessionId);
              if (historyToken) _setLocal('chatbot_history_token', historyToken);
              
              _setSession('session_id', sessionId);
              _setSession('customer_name', name);
              _setSession('customer_email', email);
              _setSession('customer_phone', phone);
              _setSession('created_at', _getSession('created_at') || new Date().toISOString());
              _setSession('updated_at', new Date().toISOString());

              const msgs = [];
              const msgEls = messagesEl.querySelectorAll('.chat-msg');
              msgEls.forEach(el => {
                let sender = 'bot';
                if (el.classList.contains('user')) sender = 'user';
                else if (el.classList.contains('error')) sender = 'error';
                if (el.innerHTML.includes('lead-submit') || el.innerHTML.includes('consent-yes')) return;
                const clone = el.cloneNode(true);
                const timeEl = clone.querySelector('.msg-time');
                let timestamp = null;
                if (timeEl) {
                  timestamp = timeEl.getAttribute('data-timestamp') || null;
                  timeEl.remove();
                }
                msgs.push({ text: clone.innerHTML.replace(/<br\s*\/?>/gi, '\n'), sender: sender, timestamp: timestamp });
              });
              _setLocal('chatbot_local_messages', JSON.stringify(msgs));
              msg.innerHTML = '<div style="font-weight:600; color:#10b981; font-size:13px;">Consent registered. Conversation history will be saved locally.</div>';
              askNotificationPreference();
            });

            document.getElementById('consent-no').addEventListener('click', () => {
              _setLocal('chatbot_consent_local_storage', 'no');
              _removeLocal('chatbot_local_session_id');
              _removeLocal('chatbot_local_messages');
              _removeLocal('chatbot_history_token');
              
              _setSession('session_id', sessionId);
              _setSession('customer_name', name);
              _setSession('customer_email', email);
              _setSession('customer_phone', phone);
              _setSession('created_at', _getSession('created_at') || new Date().toISOString());
              _setSession('updated_at', new Date().toISOString());

              msg.innerHTML = '<div style="font-weight:600; color:#475569; font-size:13px;">Conversation history will not be saved.</div>';
              askNotificationPreference();
            });
          }
        })
        .catch(err => {
          console.error("History check failed:", err);
          msg.innerHTML = '<div style="font-weight:600; color:#10b981; font-size:13px;">Thank you! We have received your details.</div>';
          enableChatInput();
        });

      }).catch(err => {
        console.error(err);
        btn.innerText = 'Submit';
        btn.disabled = false;
        alert('Failed to submit. Please try again.');
      });
    });
  }

  function sendMessage() {
    const text = inputEl.value.trim();
    if (!text || isSendingMessage) return;
    isSendingMessage = true;
    clearQuickReplies();
    
    const old = document.getElementById('chatbot-unread-divider-wrap');
    if (old) old.remove();

    disableChatInput();
    addMessage(text, 'user');
    inputEl.value = '';
    
    messageCount++;
    _setSession('chatbot_msg_count', messageCount.toString());

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'message', text: text }));
    } else {
      // Reconnect and send
      if (widgetConfig) {
        connectWs();
        // Wait for connection to open
        let retries = 0;
        const checkConn = setInterval(() => {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'message', text: text }));
            clearInterval(checkConn);
          }
          if (retries++ > 10) {
             clearInterval(checkConn);
             addMessage("Connection failed.", "error");
             removeTyping();
             isSendingMessage = false;
             enableChatInput();
          }
        }, 500);
      } else {
        isSendingMessage = false;
        enableChatInput();
      }
    }
  }

  sendBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    sendMessage();
  });
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      e.stopPropagation();
      sendMessage();
    }
  });

  }

  initChatbotWidget();

})();