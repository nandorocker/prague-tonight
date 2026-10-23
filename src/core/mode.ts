/** Fixtures and editor simulations are explicitly opt-in. */
export const demo = typeof location !== 'undefined' && new URLSearchParams(location.search).get('demo') === '1';
