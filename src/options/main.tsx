import { render } from 'preact';
import { Options } from './Options';
import { strings } from '@/shared/strings';
import { initEntitlements } from '@/core/licenseState';

document.title = strings.options.title;

// The licence section hydrated its own state, but the prompt library on this
// same page read entitlements independently and saw the free tier.
initEntitlements();

const root = document.getElementById('root');
if (root) render(<Options />, root);
