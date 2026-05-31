import React from 'react';
import { RefreshCw } from 'lucide-react';

export default function TelegramMock({ html, loading }) {
  return (
    <div className="bg-[#182533] rounded-2xl p-4 shadow-lg border border-[#2b3a4a] relative min-h-[220px]">
      <div className="flex items-center space-x-2 mb-3">
        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-500 to-blue-400 flex items-center justify-center text-telgrarr-text font-bold text-xs shadow-sm">B</div>
        <span className="text-blue-400 font-semibold text-sm">MediaBot</span>
      </div>
      {loading ? (
        <div className="absolute inset-0 flex items-center justify-center text-telgrarr-muted">
          <RefreshCw className="w-6 h-6 animate-spin" />
        </div>
      ) : (
        <div 
          className="text-[#e6eef5] text-[15px] leading-relaxed whitespace-pre-wrap break-words"
          dir="auto"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
    </div>
  );
}
