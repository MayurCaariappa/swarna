/** "Good morning" / "Good afternoon" / "Good evening" by this phone's clock. */
export function greeting(at = new Date()) {
  const h = at.getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}
