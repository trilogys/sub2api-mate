import { Redirect } from 'expo-router';

export default function AISettingsRedirect() {
  return <Redirect href={{ pathname: '/ai-assistant', params: { settings: '1' } }} />;
}
