const tools = [
  ['/connect-google','Google data','Connect and sync Search Console, GA4, Business Profile and reviews.'],
  ['/connections','Connections & files','Connect WordPress and HighLevel, then manage client source files.'],
  ['/reputation','Reputation','Sync reviews, draft responses, approve and publish replies.'],
  ['/publish-gbp','GBP publishing','Publish approved Google Business Profile posts.'],
  ['/publish-wordpress','WordPress publishing','Create drafts or publish approved content to WordPress.'],
  ['/deliver-report','Report delivery','Email approved monthly reports and record delivery.'],
  ['/billing','Billing','Review the current plan and open secure Stripe checkout.'],
  ['/admin','Gambix admin','Manage client status, access, workload, plans and renewals.'],
];

export default function ToolsPage() {
  return <main className="google-setup-page"><section className="google-setup-card">
    <a className="app-brand" href="/dashboard"><span className="app-brand-mark">L</span><span>Luna <small>Workflow launcher</small></span></a>
    <div><span className="kicker">Operational tools</span><h1>Move from insight to approved execution.</h1><p>Every publishing and delivery workflow remains separate from drafting so Gambix and clients retain control.</p></div>
    <div className="integration-grid tools-grid">{tools.map(([href,title,copy]) => <a className="panel tool-card" href={href} key={href}><span className="kicker">Open workflow</span><h3>{title}</h3><p>{copy}</p><strong>Open →</strong></a>)}</div>
    <a className="secondary-button" href="/dashboard">Return to dashboard</a>
  </section></main>;
}
