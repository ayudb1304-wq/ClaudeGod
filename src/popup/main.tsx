import { render } from 'preact';
import { Popup } from './Popup';
import { strings } from '@/shared/strings';

document.title = strings.popup.title;

const root = document.getElementById('root');
if (root) render(<Popup />, root);
