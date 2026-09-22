import { TIMESTAMP_ENDPOINT } from '@sealmark/core/light';

/**
 * The privacy statement and terms, at /privacy.
 *
 * The timestamp host is read from the same constant the signing code uses, so
 * this page cannot end up naming a service the app does not actually contact.
 * Everything here is meant to be checkable by the reader rather than taken on
 * trust - which is the only kind of privacy claim worth making.
 */

const EFFECTIVE = '18 September 2026';
const REPO = 'https://github.com/RafBro8/sealmark';

/**
 * Where privacy questions go. The same address the Good Looking Digital site
 * publishes, on a domain with working mail - a policy page pointing at a mailbox
 * nobody reads is worse than one with no address at all. Setting this to null
 * falls back to the public issue tracker.
 */
const CONTACT_EMAIL: string | null = 'hello@goodlookingdigital.com';

export function Legal({ onClose }: { onClose: () => void }) {
  const host = new URL(TIMESTAMP_ENDPOINT).host;

  return (
    <div className="legal">
      <article className="legal-inner">
        <header className="legal-head">
          <div>
            <h1>Privacy and terms</h1>
            <p className="legal-date">In effect {EFFECTIVE}</p>
          </div>
          <button type="button" className="btn" onClick={onClose}>
            Back to Sealmark
          </button>
        </header>

        <section>
          <h2>The short version</h2>
          <p className="legal-lead">
            Sealmark has no server, no accounts and no database. Your document is opened, signed and
            saved inside your own browser. It is never uploaded. We could not hand over a copy of
            your document if we were asked to, because we never had one.
          </p>
        </section>

        <section>
          <h2>What happens to a document you sign</h2>
          <ol>
            <li>You choose a file. The browser reads it into the memory of this tab.</li>
            <li>
              The page renders it, stamps your signature onto it and builds the audit record. All of
              that is code running on your own machine.
            </li>
            <li>You save the signed file and its record, as ordinary downloads.</li>
            <li>Closing the tab ends it. Nothing is kept except the files you chose to save.</li>
          </ol>
        </section>

        <section>
          <h2>The one request that can leave your browser</h2>
          <p>
            If you switch on <strong>Add a trusted timestamp</strong>, Sealmark sends the SHA-256
            fingerprint of your signed file - 32 bytes, in a request of about 67 bytes - to{' '}
            <span className="mono">{host}</span>, which relays it to a timestamp authority
            (DigiCert, sometimes Sectigo). The authority signs a statement that a file with that
            fingerprint existed at that moment, and that reply is stored in your record.
          </p>
          <p>
            <strong>The document itself is never sent.</strong> A fingerprint cannot be turned back
            into the file it came from. It can only confirm that a file someone already holds is the
            same one. Those services do see the fingerprint and the network address the request came
            from, as any website you visit does.
          </p>
          <p>
            Leave that switch off and Sealmark makes no network requests at all once the page has
            loaded.
          </p>
        </section>

        <section>
          <h2>How to check this instead of believing it</h2>
          <ul>
            <li>
              Open your browser's Network tab and sign something. You will see the app's own files
              load, and nothing else.
            </li>
            <li>
              Every response from this site carries a Content-Security-Policy that permits
              connections only to this site and to <span className="mono">{host}</span>. Your
              browser enforces it. Even a bug in our code, or a compromised library, could not send
              your document somewhere else - the browser would refuse the connection.
            </li>
            <li>
              Go offline - aeroplane mode, or unplug - and sign a document anyway. It works, because
              nothing needed a network in the first place.
            </li>
            <li>
              Read the source. All of it is public at{' '}
              <a href={REPO} target="_blank" rel="noopener noreferrer">
                github.com/RafBro8/sealmark
              </a>
              .
            </li>
          </ul>
        </section>

        <section>
          <h2>What is stored on your device</h2>
          <p>Three small preferences, kept in your browser's local storage:</p>
          <ul>
            <li>whether you chose light or dark,</li>
            <li>which signature style you last used,</li>
            <li>whether the timestamp switch was on.</li>
          </ul>
          <p>
            Nothing about your documents, and nothing about you. Clearing this site's data removes
            them. The app also keeps a copy of its own files so it can run offline.
          </p>
          <p>
            There are <strong>no cookies</strong>, no analytics, no tracking pixels, no error
            reporting and no third-party scripts of any kind.
          </p>
        </section>

        <section>
          <h2>The name and email you type in</h2>
          <p>
            They are stamped into the PDF and written into the audit record - the files you
            download. Email is optional. Neither is transmitted anywhere; they exist only in your
            copy of the document.
          </p>
        </section>

        <section>
          <h2>Visiting this site</h2>
          <p>
            The files that make up Sealmark are served by a hosting provider, which - like any web
            host - records ordinary request information such as the network address, the time and
            which file was requested, in order to serve the site and protect it from abuse. That is
            about loading a web page. Your documents are not part of it, because they never reach
            the host.
          </p>
        </section>

        <hr />

        <section>
          <h2>Terms of use</h2>

          <h3>What a Sealmark signature proves, and what it does not</h3>
          <p>
            Sealmark produces <em>tamper evidence</em>: a cryptographic fingerprint of the signed
            file, an audit record, and a certificate page. Change one byte of a signed document and
            verification fails. This is the kind of evidence the US ESIGN Act and UETA ask for -
            intent to sign, association of the signature with the record, and retention of the
            record.
          </p>
          <p>
            It is deliberately not a certificate-authority signature (PAdES), and there is no green
            tick in Adobe Reader. A matching record proves the document has not changed{' '}
            <em>relative to that record</em>. It does not by itself prove the record is genuine -
            someone could edit a document and write a fresh record for it. A trusted timestamp
            narrows that gap considerably, because nobody can obtain a timestamp dated in the past.
          </p>

          <h3>This is not legal advice</h3>
          <p>
            Whether an electronic signature is valid for a particular document, in a particular
            place, is your responsibility to establish. ESIGN itself excludes some documents,
            including wills, certain real-estate instruments and some court filings. If a signature
            matters, take advice on it.
          </p>

          <h3>Keep your own records</h3>
          <p>
            You hold the only copy. Nothing is stored for you, so nothing can be recovered for you.
            Keep the <span className="mono">.sealmark.json</span> record alongside the signed PDF -
            the record is the evidence, and without it later verification is much weaker.
          </p>

          <h3>No warranty, and no promise of availability</h3>
          <p>
            Sealmark is provided free and as-is, without warranty of any kind. There is no uptime
            commitment. Trusted timestamping depends on a free third-party service that may be slow
            or unavailable; when it is, signing still works and the timestamp can be added later.
          </p>
        </section>

        <section>
          <h2>Contact and changes</h2>
          <p>
            Sealmark is built and run by Good Looking Digital. Changes to this page are recorded in
            the project's public history, so you can see exactly what changed and when.
          </p>
          {CONTACT_EMAIL ? (
            <p>
              Questions about any of this, including a request to explain how a document you signed
              was handled: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
            </p>
          ) : (
            <p>
              Questions can be raised at{' '}
              <a href={`${REPO}/issues`} target="_blank" rel="noopener noreferrer">
                the project's issue tracker
              </a>
              .
            </p>
          )}
        </section>

        <footer className="legal-foot">
          <button type="button" className="btn" onClick={onClose}>
            Back to Sealmark
          </button>
        </footer>
      </article>
    </div>
  );
}
