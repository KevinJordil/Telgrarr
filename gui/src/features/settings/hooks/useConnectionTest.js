import { getVal, buildPayload } from '../formUtils';

export default function useConnectionTest(draft, testConnection) {
  const handleTest = (section) => {
    const nested = buildPayload(draft, section.fields);
    const testPayload = nested[section.id] || nested;
    testConnection(section.id, section.testEndpoint, testPayload);
  };

  const handleTestDeepl = () => {
    const deeplApiKey = getVal(draft, 'translator.deeplApiKey');
    testConnection('translator-deepl', '/api/settings/test/translator-deepl', deeplApiKey ? { deeplApiKey } : {});
  };

  return { handleTest, handleTestDeepl };
}
