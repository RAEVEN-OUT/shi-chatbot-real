'use client';
import React from 'react';
import { HelpCircle, BookOpen, Terminal, Shield, Users, Server, Activity, Database } from 'lucide-react';

export default function AdminHelp() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
          <HelpCircle className="text-blue-500" /> Platform Administration Manual
        </h1>
        <p className="text-gray-500 text-sm mt-1">Operational procedures and guide reference for system administrators.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Core Administrative Roles */}
        <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-3 mb-2">
            <Users className="text-gray-500" size={22} />
            <h3 className="text-lg font-bold text-gray-900">Subscriber Management</h3>
          </div>
          <p className="text-gray-500 text-sm leading-relaxed">
            As a platform administrator, you have complete authority to provision and configure subscriber accounts. 
            Under the **Subscribers** tab, you can perform:
          </p>
          <ul className="list-disc pl-5 text-sm text-gray-700 space-y-2">
            <li>Creating new subscriber accounts with custom emails and passwords.</li>
            <li>Enabling or disabling subscriber accounts to revoke access temporarily.</li>
            <li>Adjusting their maximum allowed domain limits dynamically.</li>
            <li>Upgrading/downgrading subscription tier classifications (Free, Pro, Enterprise).</li>
          </ul>
        </div>

        {/* System Monitoring and Logs */}
        <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-3 mb-2">
            <Terminal className="text-gray-500" size={22} />
            <h3 className="text-lg font-bold text-gray-900">AI Log Analysis</h3>
          </div>
          <p className="text-gray-500 text-sm leading-relaxed">
            The platform maintains a comprehensive audit trail of AI model invocations and text embeddings generation.
            Refer to the **AI Logs** console to check:
          </p>
          <ul className="list-disc pl-5 text-sm text-gray-700 space-y-2">
            <li>The prompt payloads and queries sent to Google Gemini / OpenAI.</li>
            <li>Response tokens generated, execution latency, and Firestore synchronization.</li>
            <li>Vector DB query statistics and vector index hits for support chatbot responses.</li>
          </ul>
        </div>

        {/* Infrastructure Health Operations */}
        <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-3 mb-2">
            <Server className="text-gray-500" size={22} />
            <h3 className="text-lg font-bold text-gray-900">Infrastructure Health</h3>
          </div>
          <p className="text-gray-500 text-sm leading-relaxed">
            Use the diagnostics suite in **Infrastructure Health** to inspect the status of physical services:
          </p>
          <ul className="list-disc pl-5 text-sm text-gray-700 space-y-2">
            <li>**FastAPI Web server**: Confirms backend routing is active.</li>
            <li>**ChromaDB Vector Node**: Validates local index databases are responding.</li>
            <li>**Firebase Cloud Services**: Assures that authentication and Firestore sync is live.</li>
            <li>**WebSocket Gateway**: Confirms socket server handles live chat sessions.</li>
          </ul>
        </div>

        {/* Security and Policies */}
        <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-3 mb-2">
            <Shield className="text-gray-500" size={22} />
            <h3 className="text-lg font-bold text-gray-900">Security Policies</h3>
          </div>
          <p className="text-gray-500 text-sm leading-relaxed">
            Platform Security measures are automatically enforced at the routing level:
          </p>
          <ul className="list-disc pl-5 text-sm text-gray-700 space-y-2">
            <li>Firebase ID Tokens must accompany every REST call header.</li>
            <li>Only registered domains can load and open Websocket connections.</li>
            <li>Admin-specific operations require Firebase Super Admin privileges.</li>
          </ul>
        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl border border-gray-200">
        <div className="flex items-center gap-3 mb-2">
          <BookOpen className="text-gray-500" size={20} />
          <h4 className="text-gray-900 font-bold text-sm">Need Additional Assistance?</h4>
        </div>
        <p className="text-gray-500 text-xs leading-relaxed">
          For technical platform errors, server shell operations, or raw database sync resets, please contact the cloud operations team directly at <span className="text-gray-500 font-semibold font-mono">ops@antigravity.ai</span>.
        </p>
      </div>
    </div>
  );
}
