/** "Good morning" / "Good afternoon" / "Good evening" by this phone's clock; "Hi" after midnight. */
export function greeting(at = new Date()) {
  const h = at.getHours();
  return h < 4
    ? "Hi"
    : h < 12
      ? "Good morning"
      : h < 18
        ? "Good afternoon"
        : "Good evening";
}
