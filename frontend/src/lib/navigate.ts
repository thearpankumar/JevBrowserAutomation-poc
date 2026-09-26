/** Full-page navigation. Its own module so tests can mock it — jsdom's window.location can't be stubbed. */
export function navigateTo(url: string): void {
  window.location.assign(url);
}
