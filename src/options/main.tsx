import { render } from 'preact';
import { Options } from './Options';
import { strings } from '@/shared/strings';

document.title = strings.options.title;

const root = document.getElementById('root');
if (root) render(<Options />, root);
