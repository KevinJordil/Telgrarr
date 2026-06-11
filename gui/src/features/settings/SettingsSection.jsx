import React from 'react';
import { motion } from 'framer-motion';
import {
  Send, Timer, Tv, Film, Play, Star, Search, Settings as SettingsIcon,
  CheckCircle, XCircle, Loader2, Wifi, Lock,
  ChevronDown, ChevronUp, Database, Languages, FileText, Save
} from 'lucide-react';
import FieldRenderer from './FieldRenderer';
import { getVal } from './formUtils';

const ICONS = { Send, Timer, Tv, Film, Play, Star, Search, Lock, Database, Languages, FileText };

export default function SettingsSection({
  section,
  draft,
  expanded,
  setExpanded,
  saveStatus,
  testStatus,
  sectionIsDirty,
  handleChange,
  handleTest,
  handleTestDeepl,
  handleSaveRequest
}) {
  const SectionIcon = ICONS[section.icon] || SettingsIcon;
  const isExpanded = expanded[section.id] !== false;
  const sectionStatus = saveStatus[section.id] || 'idle';
  const sectionTest = testStatus[section.id];
  const deeplTest = testStatus['translator-deepl'];
  const dirty = sectionIsDirty(section);

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-panel overflow-hidden">
      <button
        onClick={() => setExpanded((p) => ({ ...p, [section.id]: !isExpanded }))}
        className="w-full flex items-center justify-between p-4"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-telgrarr-purple/15 rounded-lg flex items-center justify-center">
            <SectionIcon className="w-4 h-4 text-telgrarr-purple" />
          </div>
          <span className="font-semibold text-telgrarr-text">{section.title}</span>
          {dirty && <span className="w-1.5 h-1.5 bg-telgrarr-purple rounded-full animate-pulse" />}
        </div>
        <div className="flex items-center gap-2">
          {sectionStatus === 'saved' && <CheckCircle className="w-4 h-4 text-green-400" />}
          {sectionStatus === 'error' && <XCircle className="w-4 h-4 text-red-400" />}
          {isExpanded ? <ChevronUp className="w-4 h-4 text-telgrarr-muted" /> : <ChevronDown className="w-4 h-4 text-telgrarr-muted" />}
        </div>
      </button>

      {isExpanded && (
        <div className="px-4 pb-5 space-y-1 border-t border-telgrarr-border/50">
          {section.fields.map((field) => (
            <FieldRenderer
              key={field.key}
              field={field}
              value={getVal(draft, field.key)}
              onChange={(v) => handleChange(field.key, v)}
            />
          ))}

          {section.testEndpoint && (
            <div className="pt-3">
              <button
                onClick={() => handleTest(section)}
                disabled={sectionTest?.loading}
                className="flex items-center gap-2 text-sm text-telgrarr-purple hover:text-telgrarr-purple-glow transition-colors disabled:opacity-50"
              >
                {sectionTest?.loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
                {section.testLabel}
              </button>
              {sectionTest && !sectionTest.loading && (
                <p className={`text-xs mt-1.5 flex items-center gap-1.5 ${sectionTest.success ? 'text-green-400' : 'text-red-400'}`}>
                  {sectionTest.success ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                  {sectionTest.message}
                </p>
              )}
            </div>
          )}

          {section.id === 'translator' && (
            <div className="pt-2">
              <button
                onClick={handleTestDeepl}
                disabled={deeplTest?.loading}
                className="flex items-center gap-2 text-sm text-telgrarr-purple hover:text-telgrarr-purple-glow transition-colors disabled:opacity-50"
              >
                {deeplTest?.loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
                Test DeepL Key
              </button>
              {deeplTest && !deeplTest.loading && (
                <p className={`text-xs mt-1.5 flex items-center gap-1.5 ${deeplTest.success ? 'text-green-400' : 'text-red-400'}`}>
                  {deeplTest.success ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                  {deeplTest.message}
                </p>
              )}
            </div>
          )}

          <div className="pt-3">
            <button
              onClick={() => handleSaveRequest(section.id)}
              disabled={!dirty || sectionStatus === 'saving'}
              className="flex items-center gap-2 px-4 py-2.5 bg-telgrarr-purple hover:bg-telgrarr-purple-glow disabled:opacity-30 disabled:cursor-not-allowed text-telgrarr-text text-sm font-semibold rounded-xl transition-all active:scale-[0.98] shadow-lg shadow-telgrarr-purple/20"
            >
              {sectionStatus === 'saving' ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving…
                </>
              ) : sectionStatus === 'saved' ? (
                <>
                  <CheckCircle className="w-4 h-4" />
                  Saved
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save {section.title}
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </motion.div>
  );
}
