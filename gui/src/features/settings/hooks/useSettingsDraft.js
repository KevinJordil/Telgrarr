import { useState, useEffect } from 'react';
import { setVal, isDirty, mergeSettingsIntoDraft } from '../formUtils';

export default function useSettingsDraft(settings, schema) {
  const [draft, setDraft] = useState(null);

  useEffect(() => {
    if (!settings || !schema) return;
    setDraft((prev) => mergeSettingsIntoDraft(prev, settings, schema));
  }, [settings, schema]);

  const handleChange = (key, value) => {
    setDraft((prev) => setVal(prev || {}, key, value));
  };

  const sectionIsDirty = (section) => isDirty(draft, settings, section.fields);

  return {
    draft,
    handleChange,
    sectionIsDirty
  };
}
