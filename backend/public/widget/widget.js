(() => {
    var e, t = {
            620: () => {
                function e(e) {
                    return function(e) {
                        if (Array.isArray(e)) return t(e)
                    }(e) || function(e) {
                        if ("undefined" != typeof Symbol && null != e[Symbol.iterator] || null != e["@@iterator"]) return Array.from(e)
                    }(e) || function(e, o) {
                        if (e) {
                            if ("string" == typeof e) return t(e, o);
                            var n = {}.toString.call(e).slice(8, -1);
                            return "Object" === n && e.constructor && (n = e.constructor.name), "Map" === n || "Set" === n ? Array.from(e) : "Arguments" === n || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n) ? t(e, o) : void 0
                        }
                    }(e) || function() {
                        throw new TypeError("Invalid attempt to spread non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.")
                    }()
                }

                function t(e, t) {
                    (null == t || t > e.length) && (t = e.length);
                    for (var o = 0, n = Array(t); o < t; o++) n[o] = e[o];
                    return n
                }! function() {
                    window.WIDGET_VERSION = "1.0.8";
                    window.restartChatbotWidget = function() {
                            var e = window.CHATBOT_CONFIG || {},
                                t = e.apiKey;
                            if (t) {
                                var o = "http://127.0.0.1:8000",
                                    n = document.currentScript || document.querySelector('script[src*="widget.min.js"]') || document.querySelector('script[src*="chatbot.min.js"]') || document.querySelector('script[src*="widget-client.js"]');
                                if (n && n.src) {
                                    var i = new URL(n.src);
                                    o = "5173" === i.port ? "http://".concat(i.hostname, ":8000") : (i.port, i.origin)
                                }
                                e.apiUrl && (o = e.apiUrl), fetch("".concat(o, "/api/widget/config"), {
                                    headers: {
                                        "X-API-Key": t
                                    }
                                }).then(function(e) {
                                    return e.json()
                                }).then(function(e) {
                                    var t = e.widget_config;
                                    if (t.theme_color) {
                                        document.documentElement.style.setProperty("--theme-color", t.theme_color);
                                        var n = getContrastYIQ(t.theme_color),
                                            i = document.getElementById("chatbot-fab"),
                                            r = document.getElementById("chatbot-header"),
                                            a = document.getElementById("chatbot-send");
                                        i && (i.style.background = t.theme_color, i.style.color = n), r && (r.style.background = t.theme_color, r.style.color = n), a && (a.style.background = t.theme_color, a.style.color = n);
                                        try {
                                            var s, c = document.getElementById("chatbot-theme-style"),
                                                l = c || document.createElement("style");
                                            c || (l.id = "chatbot-theme-style", document.head.appendChild(l)), l.textContent = "", null === (s = l.sheet) || void 0 === s || s.insertRule(".chat-msg.user { background: ".concat(t.theme_color, " !important; color: ").concat(n, " !important; }"))
                                        } catch (e) {}
                                    }
                                    var d = document.querySelector(".chatbot-title");
                                    t.title && d && (d.innerText = t.title);
                                    var u = document.querySelector(".chatbot-subtitle");
                                    t.domain_name && u && (u.innerText = t.domain_name);
                                    var p = document.getElementById("chatbot-input");
                                    t.placeholder && p && (p.placeholder = t.placeholder);
                                    var m = document.getElementById("chatbot-logo");
                                    if (m)
                                        if (t.logo_url) {
                                            var h = t.logo_url.startsWith("http") ? t.logo_url : o + (t.logo_url.startsWith("/") ? "" : "/") + t.logo_url;
                                            m.innerHTML = '<img src="'.concat(h, '" alt="logo" />')
                                        } else t.title && (m.innerText = t.title.charAt(0).toUpperCase())
                                }).catch(function(e) {})
                            }
                        },
                        function() {
                            var t = window.CHATBOT_CONFIG || {};

                            function o() {
                                var e = window.location.hostname;
                                return "localhost" === e || "127.0.0.1" === e || "" === e || e.endsWith(".local")
                            }
                            var n = t.apiKey;
                            if (n) {
                                var i = document.currentScript || document.querySelector('script[src*="widget.min.js"]') || document.querySelector('script[src*="chatbot.min.js"]') || document.querySelector('script[src*="widget-client.js"]'),
                                    r = "http://127.0.0.1:8000";
                                if (i && i.src) {
                                    var a = new URL(i.src);
                                    r = "5173" === a.port ? "http://".concat(a.hostname, ":8000") : (a.port, a.origin)
                                }
                                t.apiUrl && (r = t.apiUrl);
                                var s = null,
                                    c = null,
                                    l = [],
                                    d = D("chatbot_session_id");
                                d || j("chatbot_session_id", d = "sess_" + Math.random().toString(36).substring(2, 9));
                                var u = parseInt(U("chatbot_msg_count") || "0"),
                                    p = D("chatbot_history_token") || U("chatbot_history_token") || "",
                                    m = "true" === U("chatbot_lead_captured") || "true" === D("chatbot_lead_captured") || !!p,
                                    h = !1,
                                    g = null,
                                    f = !1;
                                J();
                                var b = document.createElement("link");
                                b.rel = "stylesheet";
                                var y = o() ? Date.now() : window.WIDGET_VERSION;
                                b.href = "".concat(r, "/public/widget/widget.min.css?v=").concat(y), document.head.appendChild(b);
                                var _ = document.createElement("div");
                                _.id = "chatbot-widget-container", _.style.opacity = "0", _.style.visibility = "hidden", _.style.transition = "opacity 0.3s ease";
                                var v = document.createElement("div");
                                v.id = "chatbot-window", v.innerHTML = '\n    <div id="chatbot-header">\n      <div id="chatbot-logo">A</div>\n      <div class="chatbot-header-text">\n        <h4 class="chatbot-title">Support Chat</h4>\n        <p class="chatbot-subtitle">We reply instantly</p>\n      </div>\n      <div id="chatbot-header-actions" style="display: flex; gap: 12px; align-items: center;">\n        <div id="chatbot-notification-toggle" title="Toggle Notifications" style="cursor: pointer; display: flex; align-items: center; opacity: 0.8; transition: opacity 0.2s;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.8">\n          <svg id="chatbot-bell-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>\n        </div>\n        <div id="chatbot-close" style="cursor: pointer; display: flex; align-items: center; opacity: 0.8; transition: opacity 0.2s;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.8">\n          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>\n        </div>\n      </div>\n    </div>\n    <div id="chatbot-messages"></div>\n    <div id="chatbot-input-area">\n      <input type="text" id="chatbot-input" placeholder="Type your question..." autocomplete="off" disabled />\n      <button id="chatbot-send" disabled>\n        <svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"></path></svg>\n      </button>\n    </div>\n  ';
                                var w = document.createElement("div");
                                w.id = "chatbot-fab", w.style.position = "relative", w.innerHTML = '\n    <svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"></path></svg>\n    <div id="chatbot-unread-badge" style="position: absolute; top: -5px; right: -5px; background: #ef4444; color: white; border-radius: 50%; padding: 2px 6px; font-size: 12px; font-weight: bold; display: none; box-shadow: 0 2px 4px rgba(0,0,0,0.2); z-index: 10;">0</div>\n  ', _.appendChild(v), _.appendChild(w), document.body.appendChild(_);
                                var x = document.getElementById("chatbot-messages"),
                                    S = document.getElementById("chatbot-input"),
                                    E = document.getElementById("chatbot-send"),
                                    k = document.getElementById("chatbot-unread-badge"),
                                    I = 0,
                                    N = !1;
                                fetch("".concat(r, "/api/widget/config"), {
                                    headers: {
                                        "X-API-Key": n
                                    }
                                }).then(function(e) {
                                    if (!e.ok) throw new Error("Invalid widget API key or inactive domain");
                                    return e.json()
                                }).then(function(e) {
                                    s = e;
                                    var t, i = e.widget_config;
                                    if (i.theme_color) {
                                        document.documentElement.style.setProperty("--theme-color", i.theme_color);
                                        var a = (t = i.theme_color) && /^#([0-9A-F]{3}){1,2}$/i.test(t) ? (3 === (t = t.replace("#", "")).length && (t = t.split("").map(function(e) {
                                                return e + e
                                            }).join("")), (299 * parseInt(t.substr(0, 2), 16) + 587 * parseInt(t.substr(2, 2), 16) + 114 * parseInt(t.substr(4, 2), 16)) / 1e3 >= 128 ? "black" : "white") : "white",
                                            l = document.getElementById("chatbot-fab"),
                                            u = document.getElementById("chatbot-header"),
                                            m = document.getElementById("chatbot-send");
                                        l && (l.style.background = i.theme_color, l.style.color = a), u && (u.style.background = i.theme_color, u.style.color = a), m && (m.style.background = i.theme_color, m.style.color = a);
                                        try {
                                            var h, g = document.getElementById("chatbot-theme-style"),
                                                f = g || document.createElement("style");
                                            g || (f.id = "chatbot-theme-style", document.head.appendChild(f)), f.textContent = "", null === (h = f.sheet) || void 0 === h || h.insertRule(".chat-msg.user { background: ".concat(i.theme_color, " !important; color: ").concat(a, " !important; }"))
                                        } catch (e) {}
                                    }
                                    i.title && (document.querySelector(".chatbot-title").innerText = i.title), i.domain_name && (document.querySelector(".chatbot-subtitle").innerText = i.domain_name), i.placeholder && (S.placeholder = i.placeholder);
                                    var b = document.getElementById("chatbot-logo");
                                    if (b)
                                        if (i.logo_url) {
                                            var y = i.logo_url.startsWith("http") ? i.logo_url : r + (i.logo_url.startsWith("/") ? "" : "/") + i.logo_url;
                                            b.innerHTML = '<img src="'.concat(y, '" alt="logo" />')
                                        } else i.title && (b.innerText = i.title.charAt(0).toUpperCase(), i.theme_color && (b.style.color = i.theme_color));
                                    var v = (i.domain_url || i.domain_name || "").replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].toLowerCase(),
                                        w = window.location.hostname.toLowerCase().replace(/^www\./, "");
                                    if (!v || w === v || o()) {
                                        var E = p ? "".concat(r, "/api/widget/session/").concat(d, "?history_token=").concat(encodeURIComponent(p)) : null;
                                        if (!E) return R("chatbot_msg_count", "0"), u = 0, Y(i.welcome_message, "bot"), te(), K("ai"), X(), G(), void(!c && s && oe());
                                        fetch(E, {
                                            headers: {
                                                "X-API-Key": n
                                            }
                                        }).then(function(e) {
                                            return e.ok ? e.json() : {
                                                session_exists: !1
                                            }
                                        }).then(function(e) {
                                            if (e && e.session_exists && e.messages && e.messages.length > 0) {
                                                var t = e.unread_customer_count || 0,
                                                    o = e.messages.length;
                                                e.messages.forEach(function(e, n) {
                                                    if (t > 0 && n === o - t) {
                                                        var i = document.createElement("div");
                                                        i.id = "chatbot-unread-divider-wrap", i.style.textAlign = "center", i.style.margin = "16px 0", i.innerHTML = '<div id="chatbot-unread-divider" style="font-size: 11px; color: var(--theme-color, #3b82f6); font-weight: bold; padding: 4px 12px; background-color: #eff6ff; border-radius: 12px; display: inline-block;">'.concat(1 === t ? "1 UNREAD MESSAGE" : t + " UNREAD MESSAGES", "</div>"), x.appendChild(i), I = t, k && (k.innerText = I.toString(), k.style.display = "block")
                                                    }
                                                    var r = "bot";
                                                    "customer" === e.sender ? r = "user" : "ai" === e.sender || "admin" === e.sender ? r = "bot" : "system" === e.sender && (r = "error"), Y(e.message || e.text, r, !0, e.timestamp || e.created_at)
                                                })
                                            } else e && e.session_exists || (W("chatbot_session_id"), j("chatbot_session_id", d = "sess_" + Math.random().toString(36).substring(2, 9))), Y(i.welcome_message, "bot"), te(), K("ai");
                                            e && e.session_exists && (!1 === e.ai_enabled || e.admin_joined ? K("admin") : K("ai")), X(), G(), !c && s && oe()
                                        }).catch(function(e) {
                                            W("chatbot_session_id"), j("chatbot_session_id", d = "sess_" + Math.random().toString(36).substring(2, 9)), Y(i.welcome_message, "bot"), te(), X(), G(), !c && s && oe()
                                        })
                                    } else _ && _.parentNode && _.parentNode.removeChild(_)
                                }).catch(function(e) {
                                    _ && _.parentNode && _.parentNode.removeChild(_)
                                });
                                var T = !1;
                                w.addEventListener("click", function() {
                                    if (T = !T) {
                                        if (v.classList.add("open"), w.style.transform = "scale(0)", S.focus(), I > 0) {
                                            var e = document.getElementById("chatbot-unread-divider-wrap");
                                            e && setTimeout(function() {
                                                e.scrollIntoView({
                                                    behavior: "smooth",
                                                    block: "center"
                                                })
                                            }, 50)
                                        }
                                        I = 0, k && (k.innerText = "0", k.style.display = "none"), !c && s ? oe() : c && c.readyState === WebSocket.OPEN && c.send(JSON.stringify({
                                            type: "read_ack"
                                        }))
                                    }
                                }), document.getElementById("chatbot-close").addEventListener("click", function() {
                                    T = !1, v.classList.remove("open"), w.style.transform = "scale(1)";
                                    var e = document.getElementById("chatbot-unread-divider-wrap");
                                    e && e.remove()
                                });
                                var L = document.getElementById("chatbot-notification-toggle"),
                                    C = document.getElementById("chatbot-bell-icon");
                                L && (F(), L.addEventListener("click", function() {
                                    "Notification" in window && (j("chatbot_notification_prompt_shown", "true"), R("chatbot_notification_prompt_shown", "true"), "enabled" === D("chatbot_notification_preference") && "granted" === Notification.permission ? (j("chatbot_notification_preference", "disabled"), R("notification_preference", "disabled"), F()) : "granted" === Notification.permission ? (j("chatbot_notification_preference", "enabled"), R("notification_preference", "enabled"), F()) : "denied" !== Notification.permission ? Notification.requestPermission().then(function(e) {
                                        "granted" === e ? (j("chatbot_notification_preference", "enabled"), R("notification_preference", "enabled")) : (j("chatbot_notification_preference", "disabled"), R("notification_preference", "disabled")), F()
                                    }) : alert("Notification permission is blocked by your browser. Please enable it in your browser's site settings."))
                                })), x.addEventListener("scroll", function() {
                                    0 === x.scrollTop && p && function(t) {
                                        if (f || !h || !g) return;
                                        f = !0;
                                        var o = document.createElement("div");
                                        o.className = "chat-msg", o.style.alignSelf = "center", o.style.fontSize = "12px", o.style.color = "#94a3b8", o.innerText = "Loading older messages...", x.insertBefore(o, x.firstChild);
                                        var i = x.scrollHeight;
                                        fetch("".concat(r, "/api/widget/history?history_token=").concat(encodeURIComponent(t), "&last_created_at=").concat(encodeURIComponent(g), "&limit=10"), {
                                            headers: {
                                                "X-API-Key": n
                                            }
                                        }).then(function(e) {
                                            return e.json()
                                        }).then(function(t) {
                                            (o.remove(), t.messages && t.messages.length > 0) ? (e(t.messages).reverse().forEach(function(e) {
                                                e.response && $(e.response, "bot", e.timestamp || e.created_at), e.query && $(e.query, "user", e.timestamp || e.created_at)
                                            }), g = t.messages[t.messages.length - 1].created_at, h = t.has_more, x.scrollTop = x.scrollHeight - i) : h = !1;
                                            f = !1
                                        }).catch(function(e) {
                                            o.remove(), f = !1
                                        })
                                    }(p)
                                });
                                var O = null,
                                    A = null,
                                    B = "",
                                    M = null,
                                    z = 0,
                                    H = 5,
                                    P = 3e3,
                                    q = 6e4;
                                E.addEventListener("click", function(e) {
                                    e.preventDefault(), e.stopPropagation(), re()
                                }), S.addEventListener("keydown", function(e) {
                                    "Enter" !== e.key || e.shiftKey || e.isComposing || (e.preventDefault(), e.stopPropagation(), re())
                                })
                            }

                            function D(e) {
                                return localStorage.getItem(n + "_" + e)
                            }

                            function j(e, t) {
                                localStorage.setItem(n + "_" + e, t)
                            }

                            function W(e) {
                                localStorage.removeItem(n + "_" + e)
                            }

                            function U(e) {
                                return sessionStorage.getItem(n + "_" + e)
                            }

                            function R(e, t) {
                                sessionStorage.setItem(n + "_" + e, t)
                            }

                            function J() {
                                var e = JSON.parse(U("chatbot_utm") || "null");
                                if (!e) {
                                    var t = new URLSearchParams(window.location.search);
                                    e = {
                                        utm_source: t.get("utm_source") || "",
                                        utm_medium: t.get("utm_medium") || "",
                                        utm_campaign: t.get("utm_campaign") || "",
                                        utm_term: t.get("utm_term") || "",
                                        utm_content: t.get("utm_content") || ""
                                    }, R("chatbot_utm", JSON.stringify(e))
                                }
                                return e
                            }

                            function K(e) {
                                var t = document.querySelector(".chatbot-subtitle");
                                t && (t.innerHTML = "admin" === e ? '<span style="color:#10b981;">●</span> Chatting with Support Agent' : "ai" === e ? '<span style="color:#3b82f6;">●</span> Chatting with AI Assistant' : "We reply instantly")
                            }

                            function G() {
                                _.style.visibility = "visible", _.style.opacity = "1", _.classList.add("loaded")
                            }

                            function F() {
                                "Notification" in window ? "enabled" === D("chatbot_notification_preference") && "granted" === Notification.permission ? C.setAttribute("fill", "currentColor") : C.setAttribute("fill", "none") : L && (L.style.display = "none")
                            }

                            function X() { N = !1;
                                S.removeAttribute("disabled"), E.style.display = "", E.removeAttribute("disabled"), S.focus()
                            }

                            function V() {
                                S.setAttribute("disabled", "true"), E.setAttribute("disabled", "true")
                            }

                            function Y(e, t) {
                                var o = arguments.length > 2 && void 0 !== arguments[2] && arguments[2],
                                    n = arguments.length > 3 && void 0 !== arguments[3] ? arguments[3] : null;
                                Z();
                                var i = document.createElement("div");
                                i.className = "chat-msg ".concat(t);
                                var r = e.replace(/\\n/g, "<br/>");
                                n || (n = (new Date).toISOString());
                                var a = new Date(n).toLocaleTimeString([], {
                                    hour: "2-digit",
                                    minute: "2-digit"
                                });
                                r += '<span class="msg-time" data-timestamp="'.concat(n, '" style="display: inline-block; font-size: 10px; opacity: 0.65; float: right; margin-top: 8px; margin-left: 12px; line-height: 1;">').concat(a, '</span><div style="clear: both;"></div>'), i.innerHTML = r, x.appendChild(i), x.scrollTop = x.scrollHeight, o || function(e, t) {
                                    var o = arguments.length > 2 && void 0 !== arguments[2] ? arguments[2] : null;
                                    if ("yes" === D("chatbot_consent_local_storage")) try {
                                        var n = JSON.parse(D("chatbot_local_messages") || "[]");
                                        n.push({
                                            text: e,
                                            sender: t,
                                            timestamp: o || (new Date).toISOString()
                                        }), j("chatbot_local_messages", JSON.stringify(n))
                                    } catch (e) {}
                                }(e, t, n)
                            }

                            function $(e, t) {
                                var o = arguments.length > 2 && void 0 !== arguments[2] ? arguments[2] : null,
                                    n = document.createElement("div");
                                n.className = "chat-msg ".concat(t);
                                var i = e.replace(/\\n/g, "<br/>");
                                if (o) {
                                    var r = new Date(o).toLocaleTimeString([], {
                                        hour: "2-digit",
                                        minute: "2-digit"
                                    });
                                    i += '<span class="msg-time" data-timestamp="'.concat(o, '" style="display: inline-block; font-size: 10px; opacity: 0.65; float: right; margin-top: 8px; margin-left: 12px; line-height: 1;">').concat(r, '</span><div style="clear: both;"></div>')
                                }
                                n.innerHTML = i, x.insertBefore(n, x.firstChild)
                            }

                            function Q() {
                                O || ((O = document.createElement("div")).className = "typing-indicator", O.innerHTML = '<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>', x.appendChild(O), x.scrollTop = x.scrollHeight)
                            }

                            function Z() {
                                O && (O.remove(), O = null)
                            }

                            function ee() {
                                M && (M.remove(), M = null)
                            }

                            function te() {
                                ee();
                                var e = s && s.widget_config ? s.widget_config.quick_replies : [];
                                Array.isArray(e) && 0 !== e.length && ((M = document.createElement("div")).className = "chatbot-quick-replies", e.forEach(function(e) {
                                    var t = "string" == typeof e ? e : e.text || e.label || "",
                                        o = "string" == typeof e ? e : e.label || e.text || "";
                                    if (t && o) {
                                        var n = document.createElement("button");
                                        n.type = "button", n.className = "chatbot-quick-reply", n.textContent = o, n.addEventListener("click", function() {
                                            ee(), S.value = t, re()
                                        }), M.appendChild(n)
                                    }
                                }), M.children.length > 0 && (x.appendChild(M), x.scrollTop = x.scrollHeight))
                            }

                            function oe() {
                                var e = s.ws_url;
                                e = r.startsWith("https://") || "https:" === window.location.protocol ? e.replace("ws://", "wss://") : e.replace("wss://", "ws://");
                                var t = new URL(e);
                                t.searchParams.append("domain_id", n), t.searchParams.append("session_id", d), c = new WebSocket(t.toString()), c.onopen = function() {
                                    for (z = 0, T && c.send(JSON.stringify({
                                            type: "read_ack"
                                        })); l.length > 0;) {
                                        var e = l.shift();
                                        c.send(JSON.stringify(e))
                                    }
                                }, c.onmessage = function(e) {
                                    var t, o, n, i = JSON.parse(e.data);
                                    if ("message" === i.type || "admin_message" === i.type) {
                                        if (i.message || i.text) {
                                            if (!T && 0 === I) {
                                                var r = document.getElementById("chatbot-unread-divider-wrap");
                                                r && r.remove();
                                                var a = document.createElement("div");
                                                a.id = "chatbot-unread-divider-wrap", a.style.textAlign = "center", a.style.margin = "16px 0", a.innerHTML = '<div id="chatbot-unread-divider" style="font-size: 11px; color: var(--theme-color, #3b82f6); font-weight: bold; padding: 4px 12px; background-color: #eff6ff; border-radius: 12px; display: inline-block;">1 UNREAD MESSAGE</div>', x.appendChild(a)
                                            }
                                            Y(i.message || i.text, "bot", !1, i.timestamp || i.created_at), "admin" === i.sender || "admin_message" === i.type ? K("admin") : "ai" !== i.sender && "ai" !== i.source || K("ai");
                                            var c = U("notification_preference") || D("chatbot_notification_preference"),
                                                l = U("notification_permission") || D("chatbot_notification_permission") || ("undefined" != typeof Notification ? Notification.permission : "denied");
                                            if ("enabled" === c && "granted" === l && "undefined" != typeof Notification && "granted" === Notification.permission) {
                                                var d = "admin_message" === i.type ? "Support Team Reply" : "New Message",
                                                    p = i.message || i.text;
                                                new Notification(d, {
                                                    body: p
                                                })
                                            }
                                            if (!T) {
                                                I++;
                                                var h = document.getElementById("chatbot-unread-divider");
                                                h && (h.innerText = 1 === I ? "1 UNREAD MESSAGE" : I + " UNREAD MESSAGES"), k && (k.innerText = I.toString(), k.style.display = "block")
                                            }
                                            var g = !(s && s.widget_config && s.widget_config.lead_collection) || s.widget_config.lead_collection.status,
                                                f = s && s.widget_config && s.widget_config.lead_collection ? s.widget_config.lead_collection.limit : 2;
                                            g && u >= f && !m ? setTimeout(ie, 1e3) : (N = !1, X())
                                        }
                                    } else if ("typing" === i.type) Q();
                                    else if ("stream_delta" === i.type) t = i.text || "", Z(), ee(), A || ((A = document.createElement("div")).className = "chat-msg bot", x.appendChild(A), B = ""), o = A, n = (B += t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"), o.innerHTML = n.replace(/\n/g, "<br/>"), x.scrollTop = x.scrollHeight;
                                    else if ("stream_done" === i.type) ! function() {
                                        if (A) {
                                            var e = (new Date).toISOString(),
                                                t = new Date(e).toLocaleTimeString([], {
                                                    hour: "2-digit",
                                                    minute: "2-digit"
                                                }),
                                                o = document.createElement("div");
                                            o.className = "msg-time", o.setAttribute("data-timestamp", e), o.style.fontSize = "10px", o.style.opacity = "0.65", o.style.marginTop = "4px", o.style.textAlign = "right", o.innerText = t, A.appendChild(o)
                                        }
                                        A = null, B = ""; var lc_b=!(s&&s.widget_config&&s.widget_config.lead_collection)||s.widget_config.lead_collection.status, lc_l=s&&s.widget_config&&s.widget_config.lead_collection?s.widget_config.lead_collection.limit:2; lc_b&&u>=lc_l&&!m?setTimeout(ie,1e3):(N=!1,X())
                                    }();
                                    else if ("error" === i.type) {
                                        Y(i.text, "error");
                                        var b = !(s && s.widget_config && s.widget_config.lead_collection) || s.widget_config.lead_collection.status,
                                            y = s && s.widget_config && s.widget_config.lead_collection ? s.widget_config.lead_collection.limit : 2;
                                        b && u >= y && !m ? setTimeout(ie, 1e3) : (N = !1, X())
                                    } else "system" === i.type && ((i.text || i.message) && (Y(i.text || i.message, "bot"), (i.text || i.message).toLowerCase().includes("ai assistant") && K("ai")), N = !1, X())
                                }, c.onclose = function() {
                                    c = null,
                                        function() {
                                            if (z >= H) return Y("Connection failed. Please refresh the page.", "error"), N = !1, void X();
                                            var e = Math.min(P * Math.pow(2, z), q);
                                            z++, setTimeout(function() {
                                                !c && s && T && oe()
                                            }, e)
                                        }()
                                }
                            }

                            function ne() {
                                if ("true" !== U("chatbot_notification_asked")) {
                                    var e = document.createElement("div");
                                    e.className = "chat-msg bot", e.innerHTML = '\n      <div style="font-weight:700; font-size:14px; margin-bottom:4px; color:#1e293b;">Stay Updated</div>\n      <div style="font-size:12px; color:#64748b; line-height:1.4; margin-bottom:12px;">\n        Your conversation has been saved. Would you like to receive notifications when our support team replies?\n      </div>\n      <div style="display:flex; gap:8px;">\n        <button id="noti-enable" style="flex:1; padding:8px; background:var(--theme-color, #3B82F6); color:white; border:none; border-radius:6px; cursor:pointer; font-weight:bold; font-size:12px;">Enable Notifications</button>\n        <button id="noti-deny" style="flex:1; padding:8px; background:#e2e8f0; color:#475569; border:none; border-radius:6px; cursor:pointer; font-weight:bold; font-size:12px;">Not Now</button>\n      </div>\n    ', x.appendChild(e), x.scrollTop = x.scrollHeight, document.getElementById("noti-deny").addEventListener("click", function() {
                                        R("chatbot_notification_asked", "true"), R("notification_preference", "disabled"), j("chatbot_notification_preference", "disabled"), R("updated_at", (new Date).toISOString()), e.innerHTML = '<div style="font-size:12px; color:#64748b;">Notifications disabled.</div>', X()
                                    }), document.getElementById("noti-enable").addEventListener("click", function() {
                                        R("chatbot_notification_asked", "true"), R("notification_preference", "enabled"), j("chatbot_notification_preference", "enabled"), R("updated_at", (new Date).toISOString()), "Notification" in window ? Notification.requestPermission().then(function(t) {
                                            R("notification_permission", t), j("chatbot_notification_permission", t), e.innerHTML = "granted" === t ? '<div style="font-size:12px; color:#10b981; font-weight:600;">Notifications enabled!</div>' : '<div style="font-size:12px; color:#ef4444;">Notification permission denied.</div>', X()
                                        }).catch(function(e) {
                                            X()
                                        }) : (e.innerHTML = '<div style="font-size:12px; color:#64748b;">Notifications not supported by your browser.</div>', X())
                                    })
                                } else X()
                            }

                            function ne() {
                                if ("true" !== D("chatbot_notification_prompt_shown") && "true" !== U("chatbot_notification_prompt_shown"))
                                    if ("Notification" in window) {
                                        if ("granted" === Notification.permission || "denied" === Notification.permission) return j("chatbot_notification_prompt_shown", "true"), void X();
                                        var e = document.createElement("div");
                                        e.className = "chat-msg bot", e.innerHTML = '\n      <div style="font-weight:600; margin-bottom:8px; font-size:13px;">Would you like to receive notifications when support replies?</div>\n      <div style="display:flex; gap:8px;">\n        <button id="notify-yes" style="flex:1; padding:6px 12px; background:#10b981; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:bold; font-size:12px;">Enable Notifications</button>\n        <button id="notify-no" style="flex:1; padding:6px 12px; background:#ef4444; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:bold; font-size:12px;">Not Now</button>\n      </div>\n    ', x.appendChild(e), x.scrollTop = x.scrollHeight, document.getElementById("notify-yes").addEventListener("click", function() {
                                            e.innerHTML = '<div style="font-weight:600; color:#475569; font-size:13px;">Requesting permission...</div>', Notification.requestPermission().then(function(t) {
                                                j("chatbot_notification_prompt_shown", "true"), "granted" === t ? (R("notification_preference", "enabled"), j("chatbot_notification_preference", "enabled"), R("notification_permission", "granted"), j("chatbot_notification_permission", "granted"), e.innerHTML = '<div style="font-weight:600; color:#10b981; font-size:13px;">Notifications enabled.</div>') : e.style.display = "none", X()
                                            }).catch(function(t) {
                                                e.style.display = "none", X()
                                            })
                                        }), document.getElementById("notify-no").addEventListener("click", function() {
                                            j("chatbot_notification_prompt_shown", "true"), e.style.display = "none", X()
                                        })
                                    } else X();
                                else X()
                            }

                            function ie() {
                                V();
                                var t = document.createElement("div");
                                t.className = "chat-msg bot";
                                var o = s && s.widget_config && s.widget_config.lead_collection && s.widget_config.lead_collection.fields ? s.widget_config.lead_collection.fields : ["name", "email", "phone"],
                                    i = '<div style="font-weight:600; margin-bottom:8px; font-size:13px;">Can we get your details to assist you better?</div>';
                                o.includes("name") && (i += '<input type="text" id="lead-name" placeholder="Name" style="width:100%; box-sizing:border-box; margin-bottom:8px; padding:8px; border:1px solid #ccc; border-radius:4px; font-size:13px;" />'), o.includes("email") && (i += '<input type="email" id="lead-email" placeholder="Email" style="width:100%; box-sizing:border-box; margin-bottom:8px; padding:8px; border:1px solid #ccc; border-radius:4px; font-size:13px;" />'), o.includes("phone") && (i += '<input type="tel" id="lead-phone" placeholder="Phone Number" style="width:100%; box-sizing:border-box; margin-bottom:8px; padding:8px; border:1px solid #ccc; border-radius:4px; font-size:13px;" />'), i += '<button id="lead-submit" style="width:100%; padding:8px; background:var(--theme-color, #3B82F6); color:white; border:none; border-radius:4px; cursor:pointer; font-weight:bold; font-size:13px;">Submit</button>', t.innerHTML = i, x.appendChild(t), x.scrollTop = x.scrollHeight, document.getElementById("lead-submit").addEventListener("click", function() {
                                    var i = document.getElementById("lead-name"),
                                        a = document.getElementById("lead-email"),
                                        s = document.getElementById("lead-phone"),
                                        l = i ? i.value.trim() : "",
                                        u = a ? a.value.trim() : "",
                                        f = s ? s.value.trim() : "",
                                        b = !1;
                                    if (o.includes("name") && !l && (b = !0), o.includes("email") && !u && (b = !0), o.includes("phone") && !f && (b = !0), b) alert("Please fill out all required fields.");
                                    else {
                                        var y = document.getElementById("lead-submit");
                                        y.innerText = "Submitting...", y.disabled = !0, fetch("".concat(r, "/api/widget/lead"), {
                                            method: "POST",
                                            headers: {
                                                "Content-Type": "application/json",
                                                "X-API-Key": n
                                            },
                                            body: JSON.stringify({
                                                session_id: d,
                                                name: l || "Not Provided",
                                                email: u || "no-reply@domain.com",
                                                phone: f || "Not Provided",
                                                utm: J()
                                            })
                                        }).then(function(e) {
                                            return e.json()
                                        }).then(function(o) {
                                            (p = o.history_token || "") && (R("chatbot_history_token", p), j("chatbot_history_token", p)), fetch("".concat(r, "/api/widget/history?history_token=").concat(encodeURIComponent(p), "&limit=10"), {
                                                headers: {
                                                    "X-API-Key": n
                                                }
                                            }).then(function(e) {
                                                return e.json()
                                            }).then(function(o) {
                                                R("chatbot_lead_captured", "true"), j("chatbot_lead_captured", "true"), m = !0;
                                                var i = o.messages ? o.messages.filter(function(e) {
                                                    return e.session_id !== d
                                                }) : [];
                                                i.length > 0 ? (t.innerHTML = '\n              <div style="font-weight:600; color:#10b981; font-size:13px; margin-bottom:8px;">Thank you! We have received your details.</div>\n              <div style="font-size:12px; margin-bottom:8px; color:#475569; line-height: 1.4;">We found a previous conversation. Would you like to restore/maintain your history?</div>\n              <div style="display:flex; gap:8px;">\n                <button id="restore-yes" style="flex:1; padding:6px 12px; background:#10b981; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:bold; font-size:12px;">Yes, Restore</button>\n                <button id="restore-no" style="flex:1; padding:6px 12px; background:#ef4444; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:bold; font-size:12px;">No, Start Fresh</button>\n              </div>\n            ', document.getElementById("restore-yes").addEventListener("click", function() {
                                                    j("chatbot_consent_local_storage", "yes"), p && j("chatbot_history_token", p), R("session_id", d), R("customer_name", l), R("customer_email", u), R("customer_phone", f), R("created_at", U("created_at") || (new Date).toISOString()), R("updated_at", (new Date).toISOString()), t.innerHTML = '<div style="font-weight:600; color:#10b981; font-size:13px;">History restored.</div>';
                                                    var a = JSON.parse(D("chatbot_local_messages") || "[]"),
                                                        s = [];
                                                    i.forEach(function(e) {
                                                        e.response && $(e.response, "bot", e.timestamp || e.created_at), e.query && $(e.query, "user", e.timestamp || e.created_at)
                                                    }), e(i).reverse().forEach(function(e) {
                                                        e.query && s.push({
                                                            text: e.query,
                                                            sender: "user",
                                                            timestamp: e.timestamp || e.created_at
                                                        }), e.response && s.push({
                                                            text: e.response,
                                                            sender: "bot",
                                                            timestamp: e.timestamp || e.created_at
                                                        })
                                                    }), s.push.apply(s, e(a)), j("chatbot_local_messages", JSON.stringify(s)), g = i.length > 0 ? i[i.length - 1].created_at : null, h = o.has_more, i[0] && i[0].session_id && (j("chatbot_session_id", d = i[0].session_id), fetch("".concat(r, "/api/widget/lead"), {
                                                        method: "POST",
                                                        headers: {
                                                            "Content-Type": "application/json",
                                                            "X-API-Key": n
                                                        },
                                                        body: JSON.stringify({
                                                            session_id: d,
                                                            name: l,
                                                            email: u,
                                                            phone: f,
                                                            utm: J()
                                                        })
                                                    }).then(function(e) {
                                                        return e.json()
                                                    }).then(function(e) {
                                                        (p = e.history_token || p) && (R("chatbot_history_token", p), j("chatbot_history_token", p))
                                                    }).catch(function() {}), c && (c.close(), oe())), ne()
                                                }), document.getElementById("restore-no").addEventListener("click", function() {
                                                    j("chatbot_consent_local_storage", "no"), W("chatbot_history_token"), W("chatbot_local_session_id"), W("chatbot_local_messages"), R("session_id", d), R("customer_name", l), R("customer_email", u), R("customer_phone", f), R("created_at", U("created_at") || (new Date).toISOString()), R("updated_at", (new Date).toISOString()), t.innerHTML = '<div style="font-weight:600; color:#475569; font-size:13px;">Starting fresh session. History skipped.</div>', ne()
                                                })) : (t.innerHTML = '\n              <div style="font-weight:600; color:#10b981; font-size:13px; margin-bottom:8px;">Thank you! We have received your details.</div>\n              <div style="font-size:12px; margin-bottom:8px; color:#475569; line-height: 1.4;">Would you like us to save your chat history on this device so you can continue this conversation later?</div>\n              <div style="display:flex; gap:8px;">\n                <button id="consent-yes" style="flex:1; padding:6px 12px; background:#10b981; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:bold; font-size:12px;">Yes, Save</button>\n                <button id="consent-no" style="flex:1; padding:6px 12px; background:#ef4444; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:bold; font-size:12px;">No</button>\n              </div>\n            ', document.getElementById("consent-yes").addEventListener("click", function() {
                                                    j("chatbot_consent_local_storage", "yes"), j("chatbot_local_session_id", d), p && j("chatbot_history_token", p), R("session_id", d), R("customer_name", l), R("customer_email", u), R("customer_phone", f), R("created_at", U("created_at") || (new Date).toISOString()), R("updated_at", (new Date).toISOString());
                                                    var e = [];
                                                    x.querySelectorAll(".chat-msg").forEach(function(t) {
                                                        var o = "bot";
                                                        if (t.classList.contains("user") ? o = "user" : t.classList.contains("error") && (o = "error"), !t.innerHTML.includes("lead-submit") && !t.innerHTML.includes("consent-yes")) {
                                                            var n = t.cloneNode(!0),
                                                                i = n.querySelector(".msg-time"),
                                                                r = null;
                                                            i && (r = i.getAttribute("data-timestamp") || null, i.remove()), e.push({
                                                                text: n.innerHTML.replace(/<br\s*\/?>/gi, "\n"),
                                                                sender: o,
                                                                timestamp: r
                                                            })
                                                        }
                                                    }), j("chatbot_local_messages", JSON.stringify(e)), t.innerHTML = '<div style="font-weight:600; color:#10b981; font-size:13px;">Consent registered. Conversation history will be saved locally.</div>', ne()
                                                }), document.getElementById("consent-no").addEventListener("click", function() {
                                                    j("chatbot_consent_local_storage", "no"), W("chatbot_local_session_id"), W("chatbot_local_messages"), W("chatbot_history_token"), R("session_id", d), R("customer_name", l), R("customer_email", u), R("customer_phone", f), R("created_at", U("created_at") || (new Date).toISOString()), R("updated_at", (new Date).toISOString()), t.innerHTML = '<div style="font-weight:600; color:#475569; font-size:13px;">Conversation history will not be saved.</div>', ne()
                                                }))
                                            }).catch(function(e) {
                                                t.innerHTML = '<div style="font-weight:600; color:#10b981; font-size:13px;">Thank you! We have received your details.</div>', X()
                                            })
                                        }).catch(function(e) {
                                            y.innerText = "Submit", y.disabled = !1, alert("Failed to submit. Please try again.")
                                        })
                                    }
                                })
                            }

                            function re() {
                                var e = S.value.trim();
                                if (e && !N) {
                                    N = !0, ee();
                                    var t = document.getElementById("chatbot-unread-divider-wrap");
                                    t && t.remove(), V(), Y(e, "user"), Q(), S.value = "", R("chatbot_msg_count", (++u).toString()), c && c.readyState === WebSocket.OPEN ? c.send(JSON.stringify({
                                        type: "message",
                                        text: e
                                    })) : (l.push({
                                        type: "message",
                                        text: e
                                    }), s ? c && c.readyState !== WebSocket.CLOSED || oe() : (N = !1, X()))
                                }
                            }
                        }()
                }()
            },
            784: () => {}
        },
        o = {};

    function n(e) {
        var i = o[e];
        if (void 0 !== i) return i.exports;
        var r = o[e] = {
            exports: {}
        };
        return t[e](r, r.exports, n), r.exports
    }
    n.m = t, e = [], n.O = (t, o, i, r) => {
        if (!o) {
            var a = 1 / 0;
            for (d = 0; d < e.length; d++) {
                for (var [o, i, r] = e[d], s = !0, c = 0; c < o.length; c++)(!1 & r || a >= r) && Object.keys(n.O).every(e => n.O[e](o[c])) ? o.splice(c--, 1) : (s = !1, r < a && (a = r));
                if (s) {
                    e.splice(d--, 1);
                    var l = i();
                    void 0 !== l && (t = l)
                }
            }
            return t
        }
        r = r || 0;
        for (var d = e.length; d > 0 && e[d - 1][2] > r; d--) e[d] = e[d - 1];
        e[d] = [o, i, r]
    }, n.o = (e, t) => Object.prototype.hasOwnProperty.call(e, t), (() => {
        var e = {
            518: 0,
            631: 0
        };
        n.O.j = t => 0 === e[t];
        var t = (t, o) => {
                var i, r, [a, s, c] = o,
                    l = 0;
                if (a.some(t => 0 !== e[t])) {
                    for (i in s) n.o(s, i) && (n.m[i] = s[i]);
                    if (c) var d = c(n)
                }
                for (t && t(o); l < a.length; l++) r = a[l], n.o(e, r) && e[r] && e[r][0](), e[r] = 0;
                return n.O(d)
            },
            o = self.webpackChunkchatbot_widget_compiler = self.webpackChunkchatbot_widget_compiler || [];
        o.forEach(t.bind(null, 0)), o.push = t.bind(null, o.push.bind(o))
    })(), n.O(void 0, [631], () => n(620));
    var i = n.O(void 0, [631], () => n(784));
    i = n.O(i)
})();