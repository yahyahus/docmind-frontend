/**
 * FILE: lib/wakeup.ts
 * Pings the backend on app load to wake it up if sleeping.
 * Render free tier sleeps after 15 min of inactivity.
 * This gives it a head start before the user makes real requests.
 */
export async function wakeUpBackend() {
  try {
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/health`, {
      method: 'GET',
    });
  } catch {
    // Silently fail — backend might just be waking up
  }
}