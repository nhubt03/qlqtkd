export function venueNow(demoClock: boolean): Date {
  const actual = new Date();
  if (!demoClock) return actual;
  const demo = new Date(actual);
  demo.setHours(10, 30, 0, 0);
  return new Date(Date.now() + demo.getTime() - actual.getTime());
}

export function shouldUseDemoClock(): boolean {
  const hour = new Date().getHours();
  return hour < 8 || hour >= 16;
}
