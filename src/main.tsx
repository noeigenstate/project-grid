import { createRoot } from 'react-dom/client';
import { App } from './App';
import './shared/styles/styles.css';
import './shared/styles/glass.css';
import './shared/styles/themes.css';
import './shared/styles/polish.css';
import './shared/styles/typography.css';
import './shared/styles/interaction.css';
import './shared/styles/clarity.css';
import { restoreTheme } from './shared/themes';
import './shared/platform';

restoreTheme();
createRoot(document.getElementById('root')!).render(<App />);
