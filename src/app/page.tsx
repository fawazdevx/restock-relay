import Link from "next/link";
import {
  ArrowDownRight, ArrowRight, BadgeCheck, Boxes, CircleDollarSign,
  GitBranch, LockKeyhole, ShieldCheck, Store, Truck,
} from "lucide-react";

const steps = [
  { n: "01", icon: <Store size={19} />, title: "Set your own limits", body: "Each shop lists what it needs, its price ceiling, deadline, supplier rules and approval threshold." },
  { n: "02", icon: <GitBranch size={19} />, title: "Pool compatible demand", body: "Buyer agents group requests that can share a supplier order. Every merchant stays a separate participant." },
  { n: "03", icon: <Truck size={19} />, title: "Compare structured quotes", body: "Supplier agents bid on the pooled lot. A published scoring rule weighs price, delivery and trust evidence." },
  { n: "04", icon: <ShieldCheck size={19} />, title: "Check, approve, record", body: "Server policy blocks unsafe quotes. Shops approve their own frozen share; an optional NEAR testnet contract records approvals." },
];

export default function Home() {
  return (
    <main className="landing-page">
      <header className="landing-header">
        <Link className="landing-brand" href="/" aria-label="Restock Relay home">
          <span className="landing-mark"><Boxes size={21} strokeWidth={2.2} /></span>
          <span>restock<span>relay</span><small>WHOLESALE, TOGETHER</small></span>
        </Link>
        <nav className="landing-nav" aria-label="Page navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#why-relay">Why Relay</a>
          <a href="#trust">Trust & NEAR</a>
        </nav>
        <Link className="landing-header-cta" href="/desk">Open buying desk <ArrowRight size={16} /></Link>
      </header>

      <section className="landing-hero">
        <div className="landing-hero-copy">
          <div className="landing-kicker"><span /> LAGOS-FIRST · BUILT FOR INDEPENDENT SHOPS</div>
          <h1>Buy together.<br /><em>Stay in control.</em></h1>
          <p className="landing-lede">Restock Relay helps neighborhood shops combine compatible orders for better wholesale terms, while every shop keeps its own budget, rules and approval.</p>
          <div className="landing-actions">
            <Link className="landing-primary" href="/desk">Open the buying desk <ArrowRight size={17} /></Link>
            <a className="landing-secondary" href="#how-it-works">See the 4-step flow <ArrowDownRight size={17} /></a>
          </div>
          <div className="landing-proofline"><span><BadgeCheck size={16} /> Policy checked on the server</span><i /> <span><LockKeyhole size={15} /> No shared merchant wallet</span></div>
        </div>

        <div className="landing-visual" role="img" aria-label="Illustration of independent shop orders pooling into one supplier lot and splitting back into shop allocations">
          <div className="visual-topline"><span>THE DEMAND BRAID</span><span>ROUND 014 <i>·</i> SAMPLE</span></div>
          <div className="visual-stage">
            <div className="visual-shops">
              <div className="visual-ticket ticket-blue"><span className="ticket-code">AC</span><span><b>Amina’s Corner</b><small>Tomatoes · 4 crates</small></span><strong>₦18.5k</strong></div>
              <div className="visual-ticket ticket-amber"><span className="ticket-code">TF</span><span><b>Tola Foods</b><small>Tomatoes · 3 crates</small></span><strong>₦14.0k</strong></div>
              <div className="visual-ticket ticket-green"><span className="ticket-code">BM</span><span><b>Bisi Mini Mart</b><small>Tomatoes · 2 crates</small></span><strong>₦9.2k</strong></div>
            </div>
            <div className="visual-converge" aria-hidden="true"><i /><i /><i /></div>
            <div className="visual-lot"><span className="lot-icon"><Boxes size={19} /></span><small>POOLED LOT</small><b>9 crates</b><span>3 shops · 1 quote winner</span><div className="lot-rule" /><div className="lot-supplier"><span className="supplier-check"><BadgeCheck size={13} /></span><span><b>Fresh Fields Co.</b><small>eligible · best score</small></span><strong>₦41.7k</strong></div></div>
            <div className="visual-split" aria-hidden="true"><i /><i /><i /></div>
            <div className="visual-allocations"><span>YOUR SHOP’S SHARE</span><b>₦18,440</b><small>Review details · approve yourself</small><div className="allocation-tag"><LockKeyhole size={12} /> SHOP APPROVAL REQUIRED</div></div>
          </div>
          <div className="visual-foot"><span><i className="visual-dot blue" />Separate orders</span><span><i className="visual-dot amber" />Shared quote</span><span><i className="visual-dot green" />Separate approvals</span></div>
          <div className="visual-stamp"><CircleDollarSign size={15} /> SIMULATED PURCHASE · NO FUNDS MOVED</div>
        </div>
      </section>

      <div className="landing-strip"><span>BUILT FOR THE REALITY OF SMALL RETAIL</span><b>Weak buying power</b><i /> <b>Fragmented supplier orders</b><i /> <b>Risk of shared-wallet control</b></div>

      <section className="landing-why" id="why-relay">
        <div className="landing-section-intro">
          <span className="landing-kicker"><span /> THE PROBLEM AND THE DIFFERENCE</span>
          <h2>Small shops buy alone.<br /><em>Relay lets them bargain as a group.</em></h2>
        </div>
        <div className="landing-why-grid">
          <p>Independent food shops often place smaller orders, pay less favorable prices and spend time chasing suppliers. Pooling can improve their buying position, but pooling money or handing control to one buyer creates a new trust problem.</p>
          <div className="difference-card"><span className="difference-index">THE RELAY DIFFERENCE</span><strong>Shared buying.<br /><em>Separate control.</em></strong><p>Demand is coordinated; budgets, supplier allowlists and approvals stay with each shop. The system proposes an allocation. Each merchant decides whether to authorize its own share.</p><div className="difference-rule"><span>01 / COORDINATE</span><ArrowRight size={15} /><span>02 / KEEP CONTROL</span></div></div>
        </div>
      </section>

      <section className="landing-flow" id="how-it-works">
        <div className="flow-heading"><div><span className="landing-kicker"><span /> FROM RESTOCK NEED TO REVIEWABLE RECEIPT</span><h2>A buying round with<br /><em>clear steps and clear limits.</em></h2></div><p>One deterministic flow, designed to finish in under two minutes in the seeded walkthrough.</p></div>
        <div className="flow-grid">{steps.map((step) => <article className="flow-card" key={step.n}><div className="flow-card-top"><span className="flow-icon">{step.icon}</span><span>{step.n}</span></div><h3>{step.title}</h3><p>{step.body}</p></article>)}</div>
      </section>

      <section className="landing-trust" id="trust">
        <div className="trust-copy"><span className="landing-kicker"><span /> SECURITY BEFORE AUTONOMY</span><h2>Agents can coordinate.<br /><em>Policy makes the call.</em></h2><p>Quotes are treated as untrusted data. A deterministic server policy checks each offer against merchant limits and can allow, warn or block it. Supplier text cannot rewrite those rules, and a kill switch stops new approvals.</p><Link href="/desk" className="trust-link">Inspect the security panel <ArrowRight size={16} /></Link></div>
        <div className="trust-boundary"><div className="boundary-head"><ShieldCheck size={18} /><span>WHAT’S REAL IN THIS PROTOTYPE</span></div><div className="boundary-row"><b>Agent market</b><span>Deterministic simulation</span></div><div className="boundary-row"><b>Purchase payment</b><span className="boundary-warn">Simulated · no funds move</span></div><div className="boundary-row"><b>NEAR contract</b><span>Optional testnet shop approvals</span></div><div className="boundary-row"><b>On-chain record</b><span>Opaque hashes · no merchant data</span></div><p>The contract records a merchant’s approval of frozen round details. It does not enforce procurement policy, hold funds or pay a supplier. The current wallet walkthrough signs one connected demo shop; other shops stay simulated.</p></div>
      </section>

      <section className="landing-last-cta"><div><span className="landing-kicker"><span /> TRY THE WHOLE LOOP</span><h2>See a pooled order<br />go from request to receipt.</h2><p>Run the seeded procurement round, then try the blocked supplier attack.</p></div><Link className="landing-primary" href="/desk">Enter the buying desk <ArrowRight size={17} /></Link></section>

      <footer className="landing-footer"><Link className="landing-brand footer-brand" href="/" aria-label="Restock Relay home"><span className="landing-mark"><Boxes size={19} /></span><span>restock<span>relay</span><small>WHOLESALE, TOGETHER</small></span></Link><div className="footer-note"><b>AI Swarms · AI Security & Defense</b><span>Hackathon prototype · simulated buying · optional NEAR testnet approval</span></div><div className="footer-links"><Link href="/desk">Open desk</Link><a href="#how-it-works">How it works</a><a href="#trust">Trust boundary</a></div></footer>
    </main>
  );
}
