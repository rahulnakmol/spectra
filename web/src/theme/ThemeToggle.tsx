import { ToggleButton } from '@fluentui/react-components';
import { WeatherSunny24Regular, WeatherMoon24Regular } from '@fluentui/react-icons';
import { useTheme } from './ThemeProvider';

export function ThemeToggle(): JSX.Element {
  const { mode, setMode } = useTheme();
  const next: typeof mode = mode === 'dark' ? 'light' : 'dark';
  return (
    <ToggleButton
      appearance="subtle"
      checked={mode === 'dark'}
      onClick={() => setMode(next)}
      icon={mode === 'dark' ? <WeatherMoon24Regular /> : <WeatherSunny24Regular />}
      aria-label={`Switch to ${next} theme`}
      aria-pressed={mode === 'dark'}
    />
  );
}
