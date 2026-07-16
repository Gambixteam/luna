const features = [
  ['Audit', 'Find the technical, local, content, and conversion issues limiting growth.'],
  ['Strategy', 'Turn real search data into a focused 30, 60, and 90-day action plan.'],
  ['Execution', 'Create optimized pages, GBP posts, briefs, and recommendations with human review.'],
  ['Reporting', 'Show clients what changed, what was completed, and what matters next.'],
];

export default function HomePage() {
  return (
    <main>
      <nav className="nav shell">
        <a className="brand" href="#top" aria-label="Luna by Gambix home">
          <span className="brand-mark">L</span>
          <span>Luna <small>by Gambix</small></span>
        </a>
        <div className="nav-links">
          <a href="#platform">Platform</a>
          <a href="#process">How it works</a>
          <a href="#plans">Plans</a>
        </div>
        <a className="button button-small" href="https://gambix.io/contact">Request access</a>
      </nav>

      <section className="hero shell" id="top">
        <div className="eyebrow"><span /> Organic growth intelligence for service businesses</div>
        <h1>Turn search visibility into <em>real business growth.</em></h1>
        <p className="hero-copy">Luna combines local SEO, website optimization, content, analytics, and Gambix strategy into one managed growth system.</p>
        <div className="hero-actions">
          <a className="button" href="https://gambix.io/contact">Join the Founding 15</a>
          <a className="text-link" href="#platform">Explore the platform <span>→</span></a>
        </div>
        <div className="proof-row">
          <span>Human-reviewed strategy</span><span>Controlled AI execution</span><span>Plain-English reporting</span>
        </div>

        <div className="dashboard-preview">
          <div className="preview-top"><div><span className="status-dot" /> Luna Growth Command Center</div><span>Last updated today</span></div>
          <div className="preview-grid">
            <aside>
              <div className="mini-brand"><span className="brand-mark">L</span> Luna</div>
              {['Overview','Opportunities','Content','Local visibility','Reports'].map((item, index) => <div className={index === 0 ? 'menu active' : 'menu'} key={item}>{item}</div>)}
            </aside>
            <div className="preview-content">
              <div className="preview-heading"><div><span>Good morning</span><h2>Your growth priorities</h2></div><button>Generate report</button></div>
              <div className="metric-grid">
                <article><span>Search visibility</span><strong>72%</strong><small>↑ 11.4% this month</small></article>
                <article><span>Qualified clicks</span><strong>1,284</strong><small>↑ 24.2% this month</small></article>
                <article><span>Local presence</span><strong>Strong</strong><small>8 opportunities open</small></article>
              </div>
              <div className="chart-card"><div><span>Organic growth</span><strong>Visibility trend</strong></div><svg viewBox="0 0 720 180" role="img" aria-label="Growth chart"><defs><linearGradient id="fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#6d5dfc" stopOpacity=".35"/><stop offset="100%" stopColor="#6d5dfc" stopOpacity="0"/></linearGradient></defs><path d="M0 150 C80 145 90 122 160 126 S250 100 310 108 S410 76 470 82 S580 35 720 28 L720 180 L0 180 Z" fill="url(#fill)"/><path d="M0 150 C80 145 90 122 160 126 S250 100 310 108 S410 76 470 82 S580 35 720 28" fill="none" stroke="#7c6cff" strokeWidth="5" strokeLinecap="round"/></svg></div>
            </div>
          </div>
        </div>
      </section>

      <section className="section shell" id="platform">
        <div className="section-label">The Luna platform</div>
        <div className="section-head"><h2>One system. Every organic growth priority.</h2><p>Stop paying for disconnected reports and random SEO tasks. Luna shows the work that matters, then helps Gambix execute it.</p></div>
        <div className="feature-grid">{features.map(([title, copy], index) => <article key={title}><span>0{index + 1}</span><h3>{title}</h3><p>{copy}</p><div className="feature-arrow">↗</div></article>)}</div>
      </section>

      <section className="process" id="process"><div className="shell process-grid"><div><div className="section-label light">Built for execution</div><h2>Strategy without follow-through is worthless.</h2><p>Luna turns analysis into assigned, approved, and measurable work. Gambix remains in control of quality while AI removes low-value manual effort.</p><a className="button button-light" href="https://gambix.io/contact">Build your growth plan</a></div><ol><li><span>01</span><div><strong>Connect</strong><p>Add your website, Google data, business profile, and brand information.</p></div></li><li><span>02</span><div><strong>Diagnose</strong><p>Luna identifies the highest-value visibility and conversion gaps.</p></div></li><li><span>03</span><div><strong>Execute</strong><p>Gambix reviews and completes the approved work across your site and local presence.</p></div></li><li><span>04</span><div><strong>Measure</strong><p>Track business outcomes, completed work, risks, and next priorities.</p></div></li></ol></div></section>

      <section className="section shell plans" id="plans"><div className="section-label">Luna plans</div><div className="section-head"><h2>Built for businesses serious about visibility.</h2><p>Start with the level of execution your market requires. Every plan includes human review.</p></div><div className="plan-grid"><article><span>Core</span><h3>$750<small>/month</small></h3><p>Build and maintain a strong local SEO foundation.</p><a href="https://gambix.io/contact">Get started</a></article><article className="featured"><div className="popular">Most popular</div><span>Plus</span><h3>$1,250<small>/month</small></h3><p>Increase content output, optimization activity, and competitive visibility.</p><a href="https://gambix.io/contact">Request access</a></article><article><span>Scale</span><h3>Custom</h3><p>Advanced support for competitive, expanding, or multi-location businesses.</p><a href="https://gambix.io/contact">Talk to Gambix</a></article></div></section>

      <footer><div className="shell footer-inner"><a className="brand" href="#top"><span className="brand-mark">L</span><span>Luna <small>by Gambix</small></span></a><p>Search intelligence. Human strategy. Real execution.</p><a href="https://gambix.io">gambix.io ↗</a></div></footer>
    </main>
  );
}