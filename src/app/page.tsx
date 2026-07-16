const capabilities = [
  'Vercel App Router deployment at luna.gambix.io',
  'Supabase Auth, PostgreSQL, RLS, and Stripe billing foundation',
  'Centralized OpenRouter service with Luna Credits enforcement',
  'Cron-authenticated durable workflow triggers',
];

export default function HomePage() {
  return (
    <main>
      <section className="card">
        <span className="badge">Luna MVP foundation</span>
        <h1>Local SEO operations with controlled AI spend.</h1>
        <p>
          Luna is configured for Vercel, Supabase, Stripe, and OpenRouter with bounded product workflows instead of open-ended chat.
        </p>
        <ul>
          {capabilities.map((capability) => (
            <li key={capability}>{capability}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}
