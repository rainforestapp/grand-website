export default function Home() {
  return (
    <>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Grand home">
          <span>grand</span>
          <span>care, in service</span>
        </a>
        <nav className="nav" aria-label="Primary navigation">
          <a href="#grace">Grace</a>
          <a href="#family">For family</a>
          <a href="#privacy">Privacy</a>
          <a className="nav-cta" href="#waitlist">
            Join waitlist
          </a>
        </nav>
      </header>

      <main id="top">
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-media" aria-hidden="true">
            <div className="photo-frame" />
          </div>
          <div className="hero-copy">
            <p className="eyebrow">AI companion for later life</p>
            <h1 id="hero-title">
              Great company for Mum. Quiet reassurance for you.
            </h1>
            <p className="hero-intro">
              Meet Grace: a gentle voice companion who listens, chats, plays
              favourite tunes, reads aloud, and helps with everyday reminders.
            </p>
            <div className="hero-actions" aria-label="Primary calls to action">
              <a className="button button-primary" href="#waitlist">
                Join the waitlist
              </a>
              <a className="button button-secondary" href="#grace">
                See how Grace helps
              </a>
            </div>
          </div>
        </section>

        <section id="grace" className="section section-two-column">
          <div className="section-heading">
            <p className="eyebrow">For the person at home</p>
            <h2>Grace is company first, practical help second.</h2>
          </div>
          <div className="wire-card stack-card">
            <div className="quote-block">
              <span>&ldquo;Grace, play something from the old days.&rdquo;</span>
            </div>
            <div className="feature-list">
              <article>
                <span className="feature-mark" />
                <h3>Patient conversation</h3>
                <p>
                  Grace waits through pauses, repeats herself kindly, and never
                  makes a person feel tested.
                </p>
              </article>
              <article>
                <span className="feature-mark" />
                <h3>Small pleasures</h3>
                <p>
                  Music, books, local information, weather, gentle trivia, and
                  familiar topics.
                </p>
              </article>
              <article>
                <span className="feature-mark" />
                <h3>Everyday support</h3>
                <p>
                  Reminders, messages to family, and simple help when something
                  needs remembering.
                </p>
              </article>
            </div>
          </div>
        </section>

        <section id="family" className="section family-band">
          <div className="section-heading section-heading--center">
            <p className="eyebrow">For the family who buy it</p>
            <h2>
              Know Grace is helping, without turning home into a live feed.
            </h2>
          </div>
          <div className="family-grid">
            <article className="wire-card insight-card">
              <p className="card-label">Engagement</p>
              <h3>Mum has spoken with Grace most days this week.</h3>
              <div className="metric-row" aria-hidden="true">
                <span />
                <span />
                <span />
                <span />
                <span />
              </div>
            </article>
            <article className="wire-card insight-card">
              <p className="card-label">Message</p>
              <h3>
                Margaret asked Grace to tell Sarah she will be ready at two.
              </h3>
              <p>No transcript. No hidden conversation detail.</p>
            </article>
            <article className="wire-card insight-card insight-card--urgent">
              <p className="card-label">Urgent</p>
              <h3>Emergency-like moments can notify family.</h3>
              <p>Clear, filtered, and action-oriented.</p>
            </article>
          </div>
        </section>

        <section className="section examples-section">
          <div className="section-heading">
            <p className="eyebrow">Use cases</p>
            <h2>The page should show real moments, not feature jargon.</h2>
          </div>
          <div className="example-grid">
            <div className="example-pill">&ldquo;Read another chapter.&rdquo;</div>
            <div className="example-pill">
              &ldquo;Remind me to call Tom tomorrow.&rdquo;
            </div>
            <div className="example-pill">
              &ldquo;What time does the pharmacy close?&rdquo;
            </div>
            <div className="example-pill">
              &ldquo;Tell Sarah I&rsquo;ll be ready at two.&rdquo;
            </div>
            <div className="example-pill">
              &ldquo;Play Vera Lynn while I make lunch.&rdquo;
            </div>
            <div className="example-pill">&ldquo;What day is it today?&rdquo;</div>
          </div>
        </section>

        <section className="section product-preview">
          <div className="section-heading section-heading--center">
            <p className="eyebrow">Product shape</p>
            <h2>Two experiences, one trust promise.</h2>
          </div>
          <div className="preview-grid">
            <article className="device-panel">
              <div className="voice-device">
                <div className="voice-lines" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </div>
                <p>Grace is listening</p>
                <span>large type &middot; voice first &middot; calm status</span>
              </div>
              <h3>At home with Grace</h3>
              <p>Designed for voice, patience, and dignity.</p>
            </article>
            <article className="device-panel">
              <div className="phone-wire">
                <div className="phone-top" />
                <div className="phone-status">normal day</div>
                <div className="phone-row" />
                <div className="phone-row phone-row--short" />
                <div className="phone-card" />
              </div>
              <h3>Family reassurance</h3>
              <p>Broad value signals and urgent support, not surveillance.</p>
            </article>
          </div>
        </section>

        <section id="privacy" className="section trust-section">
          <div className="trust-copy">
            <p className="eyebrow">Trust close</p>
            <h2>Private by default. Honest about limits.</h2>
            <p>
              Grace is not a replacement for family, carers, clinicians, or
              emergency services. She is gentle company and practical help at
              home, with thoughtful support for the people who care.
            </p>
          </div>
          <div className="trust-rules">
            <div>No raw transcripts for family</div>
            <div>No live feed</div>
            <div>No medical claims in the headline</div>
            <div>Emergency-like alerts are clearly framed</div>
          </div>
        </section>

        <section id="waitlist" className="waitlist-section">
          <p className="eyebrow">Early access</p>
          <h2>Help Mum feel less alone. Help yourself worry a little less.</h2>
          <form className="waitlist-form">
            <label htmlFor="email">Email</label>
            <div className="form-row">
              <input id="email" type="email" placeholder="you@example.com" />
              <button type="submit">Join waitlist</button>
            </div>
          </form>
        </section>
      </main>

      <footer className="site-footer">
        <span>grand</span>
        <span>Wireframe v0.1</span>
      </footer>
    </>
  );
}
