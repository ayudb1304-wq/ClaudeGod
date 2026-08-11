import { render } from 'preact';
import { Popup } from './Popup';
import { strings } from '@/shared/strings';
import { initEntitlements } from '@/core/licenseState';

document.title = strings.popup.title;

// Entitlements are per-context module state, so this context has to hydrate
// them itself or every Pro feature here stays gated for a paying customer.
initEntitlements();

const root = document.getElementById('root');
if (root) render(<Popup />, root);
